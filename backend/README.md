# Backend Guide

## File Utama

- `app.js`: server Express dan semua endpoint API.
- `classifier.js`: penghubung ke model Python untuk prediksi.
- `history.js`: simpan, baca, hapus, dan export history klasifikasi.
- `model_service.py`: training, prediksi, dan metrik model.
- `tokens.json`: token login saat development.

## Model dan Artifact

- `model_production.joblib`: model utama untuk prediksi.
- `model_depth1.joblib`: model pembanding depth 1.
- `model_depth3.joblib`: model pembanding depth 3.
- `encoders.joblib`: encoder kategori yang dipakai model.

## Folder

- `scripts/`: skrip bantu, testing, tuning, dan maintenance model.
- `assets/`: file contoh dan hasil laporan.

## Skrip Berguna

```bash
npm run test:predict
npm run test:api
npm run test:csv
npm run tune
npm run compare
npm run set-prod-model
```

## Catatan

- Kalau ingin file model lama dihapus total, pastikan backup di `exports/backup_models/` masih ada.
- Untuk prediksi, yang wajib ada adalah model production, encoder, dan data history.
