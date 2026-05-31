#!/usr/bin/env python3
import os
import sys
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / 'data' / 'history.json'
# Prefer descriptive names when available; fall back to legacy names for backward compatibility
BASE_DIR = Path(__file__).resolve().parent
MODEL_CANDIDATES = [BASE_DIR / 'model_production.joblib', BASE_DIR / 'model.joblib']
MODEL_PATH = next((p for p in MODEL_CANDIDATES if p.exists()), MODEL_CANDIDATES[0])
ENC_PATH = BASE_DIR / 'encoders.joblib'

def train():
    try:
        import pandas as pd
        from sklearn.tree import DecisionTreeClassifier
        from sklearn.preprocessing import LabelEncoder
        from sklearn.model_selection import StratifiedKFold, GridSearchCV
        from sklearn.metrics import classification_report, confusion_matrix
        from joblib import dump
    except Exception as e:
        print(json.dumps({'error': 'Missing python dependencies', 'details': str(e)}))
        sys.exit(1)

    if not DATA_PATH.exists():
        print(json.dumps({'error': 'No training data found', 'path': str(DATA_PATH)}))
        sys.exit(1)

    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    rows = []
    for rec in data:
        inp = rec.get('input', {})
        out = rec.get('output', {})
        rows.append({
            'status': inp.get('status_hi', '') or '',
            'ttic': inp.get('ttic', '') or '',
            'ttd': int(inp.get('ttd_kb_num') or 0),
            'sto': inp.get('sto', '') or '',
            'prioritas': out.get('prioritas', '') or ''
        })

    df = pd.DataFrame(rows)
    df = df[df['prioritas'] != '']
    if df.empty:
        print(json.dumps({'error': 'No labelled rows in history.json'}))
        sys.exit(1)

    # Encode categorical features
    encoders = {}
    for col in ['status', 'ttic', 'sto']:
        le = LabelEncoder()
        df[col] = df[col].astype(str)
        le.fit(df[col].tolist())
        encoders[col] = le
        df[f'{col}_enc'] = le.transform(df[col])

    # Target encoder
    target_le = LabelEncoder()
    df['prioritas'] = df['prioritas'].astype(str)
    target_le.fit(df['prioritas'].tolist())
    df['target_enc'] = target_le.transform(df['prioritas'])
    encoders['target'] = target_le

    X = df[[ 'status_enc', 'ttic_enc', 'ttd', 'sto_enc' ]]
    y = df['target_enc']

    # Tune tree with a small grid and stratified CV
    unique, counts = pd.Series(y).value_counts().sort_index().index.tolist(), pd.Series(y).value_counts().sort_index().tolist()
    min_count = min(counts) if counts else 1
    n_splits = min(5, max(2, min_count)) if min_count >= 2 else 2
    use_cv = min_count >= 2

    param_grid = {
        'max_depth': [1, 2, 3, 4, 5, None],
        'min_samples_leaf': [1, 2, 3, 5],
        'class_weight': [None, 'balanced']
    }

    if use_cv:
        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        gs = GridSearchCV(DecisionTreeClassifier(random_state=42), param_grid, cv=skf, scoring='f1_macro', n_jobs=-1)
        gs.fit(X, y)
        clf = gs.best_estimator_
        best_params = gs.best_params_
        best_score = float(gs.best_score_)
    else:
        clf = DecisionTreeClassifier(random_state=42, max_depth=2)
        clf.fit(X, y)
        best_params = clf.get_params()
        best_score = None

    dump(clf, MODEL_PATH)
    dump(encoders, ENC_PATH)

    # store evaluation report for frontend metrics
    preds = clf.predict(X)
    report = {
        'n_samples': int(len(df)),
        'class_counts': {str(k): int(v) for k, v in zip(unique, counts)},
        'best_params': best_params,
        'best_score_f1_macro': best_score,
        'classification_report': classification_report(y, preds, output_dict=True),
        'confusion_matrix': confusion_matrix(y, preds).tolist(),
    }
    # depth comparison for current UI
    def eval_depth(depth):
        from sklearn.model_selection import cross_val_score
        c = DecisionTreeClassifier(max_depth=depth, random_state=42)
        if use_cv:
            f1_scores = cross_val_score(c, X, y, cv=min(5, n_splits), scoring='f1_macro')
            acc_scores = cross_val_score(c, X, y, cv=min(5, n_splits), scoring='accuracy')
            return {
                'f1_macro_mean': float(f1_scores.mean()),
                'accuracy_mean': float(acc_scores.mean()),
                'cv_scores': f1_scores.tolist(),
            }
        else:
            c.fit(X, y)
            return {'f1_macro_mean': None, 'accuracy_mean': float(c.score(X, y)), 'cv_scores': []}

    report['depth_comparison'] = {
        'depth_1': eval_depth(1),
        'depth_3': eval_depth(3),
    }
    report['feature_importances'] = clf.feature_importances_.tolist() if hasattr(clf, 'feature_importances_') else []
    report['feature_names'] = ['status_enc', 'ttic_enc', 'ttd', 'sto_enc']

    with open(Path(__file__).resolve().parent / 'tune_report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    with open(Path(__file__).resolve().parent / 'depth_comparison.json', 'w', encoding='utf-8') as f:
        json.dump(report['depth_comparison'], f, indent=2)

    print(json.dumps({'success': True, 'message': 'Model trained', 'model_path': str(MODEL_PATH), 'best_params': best_params, 'best_score_f1_macro': best_score}))


def predict(payload):
    try:
        from joblib import load
        import numpy as np
    except Exception as e:
        print(json.dumps({'error': 'Missing python dependencies', 'details': str(e)}))
        sys.exit(1)

    if not MODEL_PATH.exists() or not ENC_PATH.exists():
        train()

    encoders = load(ENC_PATH)
    clf = load(MODEL_PATH)

    status = str(payload.get('status_hi', '') or '')
    ttic = str(payload.get('ttic', '') or '')
    ttd = int(payload.get('ttd_kb_num') or 0)
    sto = str(payload.get('sto', '') or '')

    def transform_label(le, val):
        try:
            return int(le.transform([val])[0])
        except Exception:
            # unseen category -> map to most frequent (0)
            return 0

    s_enc = transform_label(encoders['status'], status)
    t_enc = transform_label(encoders['ttic'], ttic)
    sto_enc = transform_label(encoders['sto'], sto)

    X = [[s_enc, t_enc, ttd, sto_enc]]
    probs = clf.predict_proba(X)[0].tolist()
    pred_idx = int(clf.predict(X)[0])
    prioritas = encoders['target'].inverse_transform([pred_idx])[0]
    confidence = float(max(probs))
    feature_importances = clf.feature_importances_.tolist()

    out = {
        'prioritas': prioritas,
        'confidence': confidence,
        'probabilities': probs,
        'feature_importances': feature_importances,
        'feature_names': ['status_enc','ttic_enc','ttd','sto_enc']
    }

    # Simple human-readable reasoning: report most important feature and its value
    try:
        if feature_importances and len(feature_importances) > 0:
            fi = feature_importances
            fn = ['status_hi','ttic','ttd_kb_num','sto']
            max_idx = int(fi.index(max(fi)))
            most = fn[max_idx]
            out['reasoning'] = f"Prediksi berdasar fitur paling berpengaruh: {most} (importance={round(fi[max_idx],3)}) dengan confidence={round(confidence,3)}"
        else:
            out['reasoning'] = ''
    except Exception:
        out['reasoning'] = ''

    print(json.dumps(out))


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No action specified (train|predict)'}))
        sys.exit(1)
    import warnings
    warnings.filterwarnings('ignore')

    action = sys.argv[1]
    if action == 'train':
        train()
        sys.exit(0)
    elif action == 'predict':
        # read payload from stdin
        try:
            raw = sys.stdin.read()
            payload = json.loads(raw) if raw else {}
        except Exception:
            payload = {}
        predict(payload)
        sys.exit(0)
    elif action == 'metrics':
        try:
            from joblib import load
        except Exception as e:
            print(json.dumps({'error': 'Missing joblib', 'details': str(e)}))
            sys.exit(1)

        if not MODEL_PATH.exists() or not ENC_PATH.exists():
            print(json.dumps({'error': 'Model not trained'}))
            sys.exit(1)

        encoders = load(ENC_PATH)
        clf = load(MODEL_PATH)

        fi = clf.feature_importances_.tolist() if hasattr(clf, 'feature_importances_') else []
        classes = encoders['target'].classes_.tolist() if 'target' in encoders else []

        meta = {
            'feature_importances': fi,
            'feature_names': ['status_enc','ttic_enc','ttd','sto_enc'],
            'classes': classes,
            'model_params': getattr(clf, 'get_params', lambda: {})()
        }

        # include latest tuning report if available
        try:
            tune_path = Path(__file__).resolve().parent / 'tune_report.json'
            if tune_path.exists():
                with open(tune_path, 'r', encoding='utf-8') as f:
                    tune = json.load(f)
                meta['comparison'] = tune.get('depth_comparison', {})
                meta['tuning'] = {
                    'best_params': tune.get('best_params'),
                    'best_score_f1_macro': tune.get('best_score_f1_macro'),
                    'class_counts': tune.get('class_counts'),
                    'n_samples': tune.get('n_samples')
                }
        except Exception:
            pass

        print(json.dumps(meta))
        sys.exit(0)
    else:
        print(json.dumps({'error': f'Unknown action: {action}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
