#!/usr/bin/env python3
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT.parent / 'data' / 'history.json'
MODEL_PATH = ROOT.parent / 'model_production.joblib'
ENC_PATH = ROOT.parent / 'encoders.joblib'
REPORT_PATH = ROOT.parent / 'tune_report.json'

def load_data():
    import pandas as pd
    if not DATA_PATH.exists():
        print(json.dumps({'error':'no data file', 'path': str(DATA_PATH)}))
        sys.exit(1)

    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    rows = []
    for rec in data:
        inp = rec.get('input', {})
        out = rec.get('output', {})
        rows.append({
            'status': inp.get('status_hi','') or '',
            'ttic': inp.get('ttic','') or '',
            'ttd': int(inp.get('ttd_kb_num') or 0),
            'sto': inp.get('sto','') or '',
            'prioritas': out.get('prioritas','') or ''
        })

    df = pd.DataFrame(rows)
    df = df[df['prioritas'] != '']
    return df

def train_and_tune():
    import numpy as np
    import pandas as pd
    from sklearn.model_selection import StratifiedKFold, GridSearchCV, train_test_split
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.preprocessing import LabelEncoder
    from sklearn.metrics import classification_report, confusion_matrix
    from joblib import dump

    df = load_data()
    if df.empty:
        print(json.dumps({'error':'no labelled rows in history.json'}))
        sys.exit(1)

    # encode categorical
    encoders = {}
    for col in ['status','ttic','sto']:
        le = LabelEncoder()
        df[col] = df[col].astype(str)
        le.fit(df[col].tolist())
        encoders[col] = le
        df[f'{col}_enc'] = le.transform(df[col])

    target_le = LabelEncoder()
    df['prioritas'] = df['prioritas'].astype(str)
    target_le.fit(df['prioritas'].tolist())
    df['target_enc'] = target_le.transform(df['prioritas'])
    encoders['target'] = target_le

    X = df[['status_enc','ttic_enc','ttd','sto_enc']].values
    y = df['target_enc'].values

    # choose cv folds based on smallest class count
    unique, counts = np.unique(y, return_counts=True)
    min_count = counts.min()
    n_splits = min(5, max(2, min_count))
    if min_count < 2:
        # fallback to simple train/test
        use_cv = False
    else:
        use_cv = True

    param_grid = {
        'max_depth': [1,2,3,4,5,None],
        'min_samples_leaf': [1,2,3,5],
        'class_weight': [None, 'balanced']
    }

    clf = DecisionTreeClassifier()

    report = {'n_samples': len(df), 'class_counts': dict(zip(unique.tolist(), counts.tolist())), 'cv_used': use_cv}

    if use_cv:
        skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
        gs = GridSearchCV(clf, param_grid, cv=skf, scoring='f1_macro', n_jobs=-1, verbose=0)
        gs.fit(X,y)
        best = gs.best_estimator_
        best_params = gs.best_params_
        cv_results = gs.cv_results_
        # capture mean scores for grid
        report['best_params'] = best_params
        report['best_score_f1_macro'] = float(gs.best_score_)
        report['best_score_accuracy'] = float(np.mean(cv_results['mean_test_score'])) if 'mean_test_score' in cv_results else None
        # store per param mean
        report['cv_means'] = {k: float(v) for k,v in zip(range(len(cv_results['mean_test_score'])), cv_results['mean_test_score'])}

        # evaluate on full dataset (not ideal but for quick insight)
        preds = gs.predict(X)
        report['classification_report'] = classification_report(y, preds, output_dict=True)
        report['confusion_matrix'] = confusion_matrix(y, preds).tolist()

    else:
        # small data fallback
        Xtr, Xte, ytr, yte = train_test_split(X,y, test_size=0.2, stratify=y if len(np.unique(y))>1 else None, random_state=42)
        gs = GridSearchCV(clf, param_grid, cv=2, scoring='f1_macro', n_jobs=-1)
        gs.fit(Xtr,ytr)
        best = gs.best_estimator_
        best_params = gs.best_params_
        report['best_params'] = best_params
        preds = best.predict(Xte)
        report['classification_report'] = classification_report(yte, preds, output_dict=True)
        report['confusion_matrix'] = confusion_matrix(yte, preds).tolist()

    # save best model and encoders
    dump(best, MODEL_PATH)
    dump(encoders, ENC_PATH)

    # also build depth comparison for depth=1 and depth=3 specifically
    def eval_depth(d):
        c = DecisionTreeClassifier(max_depth=d if d is not None else None, random_state=42)
        if use_cv:
            from sklearn.model_selection import cross_val_score
            scores = cross_val_score(c, X, y, cv=min(5, n_splits), scoring='f1_macro')
            acc_scores = cross_val_score(c, X, y, cv=min(5, n_splits), scoring='accuracy')
            return float(scores.mean()), scores.tolist(), float(acc_scores.mean())
        else:
            c.fit(Xtr, ytr)
            from sklearn.metrics import accuracy_score
            pred = c.predict(Xte)
            return float(accuracy_score(yte, pred)), [], float(accuracy_score(yte, pred))

    depth1_mean, depth1_scores, depth1_acc = eval_depth(1)
    depth3_mean, depth3_scores, depth3_acc = eval_depth(3)

    report['depth_comparison'] = {
        'depth_1': {'accuracy_mean': depth1_acc, 'f1_macro_mean': depth1_mean, 'cv_scores': depth1_scores},
        'depth_3': {'accuracy_mean': depth3_acc, 'f1_macro_mean': depth3_mean, 'cv_scores': depth3_scores}
    }

    # save report
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'success': True, 'best_params': best_params, 'report_path': str(REPORT_PATH)}))

if __name__ == '__main__':
    train_and_tune()
