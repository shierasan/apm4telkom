# ML Classification Platform - BGES Telkom Pekanbaru

## 📊 Deskripsi Proyek
Website interaktif untuk **Klasifikasi Prioritas Penyelesaian Kendala Teknis** menggunakan Machine Learning. Sistem ini menggunakan Decision Tree Classifier untuk menganalisis dan mengklasifikasikan kendala teknis menjadi kategori prioritas: **Tinggi**, **Sedang**, atau **Rendah**.

### Lokasi BGES
- **Unit**: BGES (Business Gateway Enterprise Service)
- **Kota**: Pekanbaru
- **Provider**: PT. Telkomnika Indonesia (Telkom)

---

## 🎯 Fitur Utama

### 1. **Klasifikasi Prioritas Kendala**
- Form input yang user-friendly
- Input data: Status HI, TTIC, TTD KB, STO
- Output: Prioritas, Confidence Score, Reasoning

### 2. **Dashboard Statistik**
- Total klasifikasi
- Breakdown by priority (Tinggi, Sedang, Rendah)
- Grafik distribusi prioritas
- Average confidence score

### 3. **Riwayat Klasifikasi**
- Tabel detail semua klasifikasi
- Filter by priority
- Delete record
- Real-time updates

### 4. **Export Data**
- Export history ke format CSV
- Timestamp otomatis
- Detail lengkap setiap record

### 5. **Visualisasi Model**
- Statistik real-time
- Confidence score visualization
- Priority distribution chart

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: JSON file (history.json)
- **API**: RESTful API

### Frontend
- **Markup**: HTML5
- **Styling**: CSS3 + Bootstrap 5
- **Interaction**: Vanilla JavaScript
- **Charts**: Chart.js
- **Icons**: Font Awesome

### Machine Learning
- **Model**: Decision Tree Classifier
- **Logic**: Rule-based classification (dari notebook ML)

---

## 📁 Struktur Proyek

```
apm4telkom/
├── backend/
│   ├── app.js              # Express server utama
│   ├── classifier.js       # ML classifier logic
│   ├── history.js          # History manager
│   └── package.json
├── frontend/
│   ├── index.html          # Main HTML
│   ├── css/
│   │   └── style.css       # Custom styling
│   └── js/
│       └── app.js          # Frontend logic
├── data/
│   └── history.json        # History records
├── package.json
└── README.md
```

---

## 🚀 Cara Menjalankan

### Prerequisites
- Node.js >= 14.x
- npm atau yarn

### Installation

1. **Clone repository** (jika dari git)
```bash
git clone https://github.com/shierasan/apm4telkom.git
cd apm4telkom
```

2. **Install dependencies**
```bash
npm install
```

3. **Jalankan server**
```bash
npm start
```

Server akan berjalan di `http://localhost:3000`

### Development Mode

Untuk development dengan auto-reload:
```bash
npm run dev
```

> Pastikan sudah menginstall `nodemon` (included dalam dev dependencies)

---

## 📝 API Endpoints

### Health Check
```
GET /api/health
```

### Klasifikasi Kendala
```
POST /api/classify
Content-Type: application/json

{
  "status_hi": "Open",
  "ttic": "1x24 jam",
  "ttd_kb_num": 90,
  "sto": "STO Pekanbaru"
}
```

**Response:**
```json
{
  "success": true,
  "classification": {
    "prioritas": "Tinggi",
    "confidence": 0.98,
    "reasoning": "SLA 1x24 jam merupakan prioritas tertinggi"
  },
  "recordId": "uuid-string"
}
```

### Ambil History
```
GET /api/history?limit=100
```

### Filter by Priority
```
GET /api/history/priority/Tinggi
GET /api/history/priority/Sedang
GET /api/history/priority/Rendah
```

### Statistics
```
GET /api/statistics
```

### Export CSV
```
GET /api/export/csv
```

### Delete Record
```
DELETE /api/history/{recordId}
```

### Get Categories
```
GET /api/categories
```

---

## 🤖 Klasifikasi Logic (Decision Tree)

### Input Parameters
- **Status HI**: Status dari ticket (Open, In Progress, Assigned, Closed, Rejected)
- **TTIC**: Time To Initial Contact (1x24 jam, 2x24 jam, >3x24 jam)
- **TTD KB**: Time To Delivery Knowledge Base (dalam hari, 0-365)
- **STO**: Service Terminal Office

### Priority Rules

#### 🔴 **PRIORITAS TINGGI** (0.90-0.98 confidence)
1. Status ≠ Closed/Rejected AND TTIC = 1x24 jam
2. Status ≠ Closed/Rejected AND TTIC = 2x24 jam AND TTD KB ≥ 90
3. Status ≠ Closed/Rejected AND TTIC = >3x24 jam AND TTD KB ≥ 90

#### 🟡 **PRIORITAS SEDANG** (0.80-0.85 confidence)
1. Status ≠ Closed/Rejected AND TTIC = 2x24 jam AND TTD KB < 90
2. Status ≠ Closed/Rejected AND TTIC = >3x24 jam AND TTD KB < 90

#### 🟢 **PRIORITAS RENDAH** (0.70-0.95 confidence)
1. Status = Closed OR Rejected
2. Kriteria tidak sesuai dengan Tinggi/Sedang

---

## 📊 Contoh Penggunaan

### Skenario 1: Kendala Urgent
```json
{
  "status_hi": "Open",
  "ttic": "1x24 jam",
  "ttd_kb_num": 100,
  "sto": "STO Pekanbaru"
}
```
**Output**: Prioritas **TINGGI** (Confidence: 98%)
**Alasan**: SLA 1x24 jam merupakan prioritas tertinggi

### Skenario 2: Kendala Normal
```json
{
  "status_hi": "In Progress",
  "ttic": ">3x24 jam",
  "ttd_kb_num": 50,
  "sto": "STO 2"
}
```
**Output**: Prioritas **SEDANG** (Confidence: 80%)
**Alasan**: SLA >3x24 jam, masih dalam batas waktu

### Skenario 3: Kendala Selesai
```json
{
  "status_hi": "Closed",
  "ttic": "1x24 jam",
  "ttd_kb_num": 30,
  "sto": "STO Pekanbaru"
}
```
**Output**: Prioritas **RENDAH** (Confidence: 95%)
**Alasan**: Kendala sudah ditutup atau ditolak

---

## 📈 Features Roadmap

- [ ] Authentication & Authorization
- [ ] Multiple user roles
- [ ] Advanced filtering & search
- [ ] Batch classification
- [ ] Model retraining interface
- [ ] Email notifications
- [ ] Integration dengan ticketing system
- [ ] Mobile app version
- [ ] Advanced analytics & reporting

---

## 🐛 Troubleshooting

### Server tidak berjalan?
```bash
# Clear port 3000
# Windows: taskkill /PID [pid] /F
# Linux/Mac: lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill

# Restart server
npm start
```

### Port sudah terpakai?
```bash
# Ganti port di backend/app.js atau set environment variable
PORT=3001 npm start
```

### History tidak tersimpan?
Pastikan folder `data/` dan file `history.json` ada dan readable.

---

## 📚 Dokumentasi Lengkap

- Backend Classifier: [backend/classifier.js](backend/classifier.js)
- API Routes: [backend/app.js](backend/app.js)
- Frontend Logic: [frontend/js/app.js](frontend/js/app.js)
- Styling: [frontend/css/style.css](frontend/css/style.css)

---

## 👨‍💻 Author & Contributors
- Dikembangkan untuk BGES Telkom Pekanbaru
- Berdasarkan ML Model dari notebook `TestML2.ipynb`

---

## 📄 License
ISC

---

## 📞 Support & Feedback
Untuk pertanyaan atau feedback, hubungi tim pengembang atau buka issue di repository.

---

**Last Updated**: May 2026
**Version**: 1.0.0

---

## Developer Scripts & Struktur Baru

- Skrip non-runtime dan utilitas dipindahkan ke: `backend/scripts`
- Assets contoh dan laporan ditempatkan di: `backend/assets`

Berikut skrip berguna untuk pengembangan dan pemeriksaan cepat:

```bash
# Start server (production-like)
npm start

# Development (auto-reload)
npm run dev

# Run API flow test (butuh server berjalan)
npm run test:api

# Run CSV import test
npm run test:csv

# Jalankan prediction quick-check tanpa server
npm run test:predict

# Jalankan tuning model (Python environment diperlukan)
npm run tune

# Bandingkan depth model (Python environment diperlukan)
npm run compare

# Set model produksi (copy model_d3.joblib -> model.joblib)
npm run set-prod-model
```

Catatan: perintah `npm run tune` dan `npm run compare` memerlukan Python, scikit-learn, pandas, joblib, dll. Pastikan environment Python sudah terpasang.
