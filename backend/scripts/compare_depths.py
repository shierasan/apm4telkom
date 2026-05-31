#!/usr/bin/env python3
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parents[1] / 'data' / 'history.json'
BASE_DIR = Path(__file__).resolve().parents[1]
OUT_PATH = BASE_DIR / 'assets' / 'depth_comparison.json'
MODEL_D1 = BASE_DIR / 'model_depth1.joblib'
MODEL_D3 = BASE_DIR / 'model_depth3.joblib'

def load_data():
    import pandas as pd
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
    return df

def prepare(df):
    from sklearn.preprocessing import LabelEncoder
    enc = {}
    for col in ['status','ttic','sto']:
        le = LabelEncoder()
        df[col] = df[col].astype(str)
        le.fit(df[col].tolist())
        enc[col] = le
        df[f'{col}_enc'] = le.transform(df[col])

    target_le = LabelEncoder()
    df['prioritas'] = df['prioritas'].astype(str)
    target_le.fit(df['prioritas'].tolist())
    df['target_enc'] = target_le.transform(df['prioritas'])
    enc['target'] = target_le

    X = df[['status_enc','ttic_enc','ttd','sto_enc']]
    y = df['target_enc']
    return X, y, enc

def train_and_eval(max_depth, X, y):
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.model_selection import cross_val_score, train_test_split
    from joblib import dump
    import numpy as np

    clf = DecisionTreeClassifier(max_depth=max_depth, random_state=42)

    # choose cv based on smallest class count
    try:
        import collections
        counts = collections.Counter(y)
        min_count = min(counts.values())
    except Exception:
        min_count = 0

    if min_count >= 5:
        cv = 5
    elif min_count >= 2:
        cv = min(5, min_count)
    else:
        cv = None

    if cv and cv >= 2:
        scores = cross_val_score(clf, X, y, cv=cv, scoring='accuracy')
        clf.fit(X, y)
        return clf, float(scores.mean()), [float(s) for s in scores]
    else:
        # fallback to a simple train/test split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y if len(set(y))>1 else None)
        clf.fit(X_train, y_train)
        acc = float(clf.score(X_test, y_test))
        return clf, acc, [acc]

def main():
    df = load_data()
    X, y, enc = prepare(df)

    res = {}
    clf1, acc1, scores1 = train_and_eval(1, X, y)
    from joblib import dump
    dump(clf1, MODEL_D1)

    clf3, acc3, scores3 = train_and_eval(3, X, y)
    dump(clf3, MODEL_D3)

    res['depth_1'] = {'accuracy_mean': acc1, 'cv_scores': scores1}
    res['depth_3'] = {'accuracy_mean': acc3, 'cv_scores': scores3}

    # sample prediction comparison
    sample = {'status_hi':'In Progress','ttic':'2x24 jam','ttd_kb_num':70,'sto':'DUM'}
    def transform_sample(sample, enc):
        s = enc['status'].transform([str(sample['status_hi'])])[0] if str(sample['status_hi']) in enc['status'].classes_ else 0
        t = enc['ttic'].transform([str(sample['ttic'])])[0] if str(sample['ttic']) in enc['ttic'].classes_ else 0
        sto = enc['sto'].transform([str(sample['sto'])])[0] if str(sample['sto']) in enc['sto'].classes_ else 0
        ttd = int(sample.get('ttd_kb_num') or 0)
        return [[s,t,ttd,sto]]

    Xs = transform_sample(sample, enc)
    prob1 = list(clf1.predict_proba(Xs)[0]) if hasattr(clf1, 'predict_proba') else []
    prob3 = list(clf3.predict_proba(Xs)[0]) if hasattr(clf3, 'predict_proba') else []

    res['sample'] = {'input': sample, 'depth1_prob': prob1, 'depth3_prob': prob3}

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(res, f, indent=2)

    print(json.dumps(res))

if __name__ == '__main__':
    main()
