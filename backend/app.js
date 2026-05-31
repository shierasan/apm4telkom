/**
 * Express Server - API untuk ML Classification Platform
 * BGES Telkom Pekanbaru
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const KendalaClassifier = require('./classifier');
const HistoryManager = require('./history');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize classifier dan history manager
const classifier = new KendalaClassifier();
const historyManager = new HistoryManager();
// CSV upload will be handled as raw CSV text in JSON to avoid multipart dependencies

// Auth sederhana berbasis token untuk kebutuhan development.
const crypto = require('crypto');
const fs = require('fs');
const TOKENS_FILE = path.join(__dirname, 'tokens.json');

const users = {
    admin: 'admin'
};

// load persisted tokens from file (for development convenience)
let validTokens = new Set();
function loadTokensFromFile() {
    try {
        if (fs.existsSync(TOKENS_FILE)) {
            const raw = fs.readFileSync(TOKENS_FILE, 'utf8') || '[]';
            const arr = JSON.parse(raw);
            validTokens = new Set(arr.filter(Boolean));
            console.log('[AUTH] Loaded tokens from', TOKENS_FILE, 'count=', validTokens.size);
        }
    } catch (e) {
        console.warn('[AUTH] Failed to load tokens file:', e.message);
    }
}

function saveTokensToFile() {
    try {
        const arr = Array.from(validTokens);
        fs.writeFileSync(TOKENS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (e) {
        console.warn('[AUTH] Failed to save tokens file:', e.message);
    }
}

loadTokensFromFile();

function generateToken() {
    return crypto.randomBytes(24).toString('hex');
}

function authMiddleware(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = auth.slice(7);
    if (!validTokens.has(token)) {
        // Development convenience: accept any non-empty bearer token and persist it in memory
        if ((process.env.NODE_ENV || 'development') === 'development') {
            console.warn('[AUTH] Token not found in memory, adding token for development convenience');
            validTokens.add(token);
        } else {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // attach simple user info if needed
    req.user = { token };
    next();
}

function parseCsvLine(line) {
    const out = [];
    const text = String(line || '');
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === ',' && !inQuotes) {
            out.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    out.push(current.trim());
    return out;
}

function normalizeHeaderName(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function findHeaderIndex(header, aliases) {
    const normalized = header.map(normalizeHeaderName);
    for (const alias of aliases) {
        const idx = normalized.indexOf(normalizeHeaderName(alias));
        if (idx !== -1) return idx;
    }
    return -1;
}

/**
 * POST /api/login - simple auth endpoint
 * Body: { username, password }
 */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password required' });
    }

    const expected = users[username];
    if (!expected || expected !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    validTokens.add(token);
    saveTokensToFile();

    res.json({ success: true, token });
});

/**
 * POST /api/logout - invalidate token
 */
app.post('/api/logout', (req, res) => {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.json({ success: true });
    const token = auth.slice(7);
    validTokens.delete(token);
    saveTokensToFile();
    res.json({ success: true });
});

// ==================== API ROUTES ====================

/**
 * GET /api/health - Check server health
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /api/classify - Klasifikasi prioritas kendala
 */
app.post('/api/classify', authMiddleware, (req, res) => {
    try {
        const { status_hi, ttic, ttd_kb_num, sto } = req.body;

        // Validasi input
        if (!status_hi || !ttic || ttd_kb_num === undefined) {
            return res.status(400).json({
                error: 'Input tidak lengkap. Diperlukan: status_hi, ttic, ttd_kb_num'
            });
        }

        // Klasifikasi
        const result = classifier.klassifikasiPrioritas({
            status_hi,
            ttic,
            ttd_kb_num: parseInt(ttd_kb_num),
            sto: sto || 'Unknown'
        });

        // Simpan ke history
        const historyRecord = historyManager.addRecord({
            input: { status_hi, ttic, ttd_kb_num, sto },
            output: result
        });

        res.json({
            success: true,
            classification: result,
            recordId: historyRecord.id
        });

    } catch (error) {
        console.error('Error in /api/classify:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * POST /api/classify/csv - upload CSV dan klasifikasikan tiap baris.
 * Header yang diharapkan: status_hi,ttic,ttd_kb_num,sto.
 */
app.post('/api/classify/csv-text', authMiddleware, (req, res) => {
    try {
        const txt = req.body && req.body.csv;
        if (!txt) return res.status(400).json({ error: 'No csv text provided in body.csv' });

        // Parsing CSV yang toleran terhadap field berquote dan BOM.
        const lines = String(txt).split(/\r?\n/).filter(l => l.trim());
        if (lines.length <= 1) return res.status(400).json({ error: 'CSV empty or missing header' });

        // Hapus BOM jika ada.
        lines[0] = lines[0].replace(/^\uFEFF/, '');

        const header = parseCsvLine(lines[0]).map(h => h.trim());
        const idx = {
            status_hi: findHeaderIndex(header, ['status_hi', 'status hi', 'status']),
            ttic: findHeaderIndex(header, ['ttic']),
            ttd: findHeaderIndex(header, ['ttd_kb_num', 'ttd kb', 'ttd kb hari', 'ttd']),
            sto: findHeaderIndex(header, ['sto'])
        };

        const results = [];
        console.log('[CSV IMPORT] header=', header);
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = parseCsvLine(lines[i]);
            const payload = {
                status_hi: idx.status_hi !== -1 ? (cols[idx.status_hi] || '') : '',
                ttic: idx.ttic !== -1 ? (cols[idx.ttic] || '') : '',
                ttd_kb_num: idx.ttd !== -1 ? (parseInt(cols[idx.ttd]) || 0) : 0,
                sto: idx.sto !== -1 ? (cols[idx.sto] || '') : ''
            };

            let out = null;
            let saved = false;
            let savedId = null;
            let errorMsg = null;
            try {
                out = classifier.klassifikasiPrioritas(payload);
                const rec = historyManager.addRecord({ input: payload, output: out });
                saved = true;
                savedId = rec.id;
            } catch (e) {
                errorMsg = e.message || String(e);
                console.error('[CSV ROW ERROR]', e);
            }

            results.push({ input: payload, output: out, saved, savedId, error: errorMsg });
        }

        console.log(`[CSV IMPORT] processed ${results.length} rows`);
        res.json({ success: true, count: results.length, results });
    } catch (error) {
        console.error('Error in /api/classify/csv-text:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/classify/batch - proses klasifikasi massal dari array JSON.
 * Body: { rows: [{ status_hi, ttic, ttd_kb_num, sto }, ...] }
 */
app.post('/api/classify/batch', authMiddleware, (req, res) => {
    try {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
        if (!rows.length) {
            return res.status(400).json({ error: 'rows kosong. Kirim body.rows berupa array' });
        }

        const results = [];
        for (const row of rows) {
            const payload = {
                status_hi: String(row?.status_hi || '').trim(),
                ttic: String(row?.ttic || '').trim(),
                ttd_kb_num: Number.parseInt(row?.ttd_kb_num, 10) || 0,
                sto: String(row?.sto || '').trim()
            };

            let out = null;
            let saved = false;
            let savedId = null;
            let errorMsg = null;
            try {
                out = classifier.klassifikasiPrioritas(payload);
                const rec = historyManager.addRecord({ input: payload, output: out });
                saved = true;
                savedId = rec.id;
            } catch (e) {
                errorMsg = e.message || String(e);
                console.error('[BATCH ROW ERROR]', e);
            }

            results.push({ input: payload, output: out, saved, savedId, error: errorMsg });
        }

        res.json({ success: true, count: results.length, results });
    } catch (error) {
        console.error('Error in /api/classify/batch:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/history - Ambil riwayat klasifikasi
 */
app.get('/api/history', authMiddleware, (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        const history = historyManager.getHistory(limit);

        res.json({
            success: true,
            count: history.length,
            data: history
        });
    } catch (error) {
        console.error('Error in /api/history:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * GET /api/history/priority/:priority - Filter history by priority
 */
app.get('/api/history/priority/:priority', authMiddleware, (req, res) => {
    try {
        const { priority } = req.params;
        const validPriorities = ['Tinggi', 'Sedang', 'Rendah'];

        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
            });
        }

        const history = historyManager.getHistoryByPriority(priority);

        res.json({
            success: true,
            priority,
            count: history.length,
            data: history
        });
    } catch (error) {
        console.error('Error in /api/history/priority:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * GET /api/statistics - Ambil statistik klasifikasi
 */
app.get('/api/statistics', authMiddleware, (req, res) => {
    try {
        const stats = historyManager.getStatistics();

        res.json({
            success: true,
            statistics: stats
        });
    } catch (error) {
        console.error('Error in /api/statistics:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * GET /api/evaluation - Ambil metrik evaluasi model
 */
app.get('/api/evaluation', authMiddleware, (req, res) => {
    try {
        const { spawnSync } = require('child_process');
        const modelScript = path.join(__dirname, 'model_service.py');
        const python = process.env.PYTHON_PATH || 'python';
        const historyCount = historyManager.getHistory(1000).length;

        const runMetrics = () => spawnSync(python, [modelScript, 'metrics'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const runTrain = () => spawnSync(python, [modelScript, 'train'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

        let proc = runMetrics();

        if (proc.error) {
            throw proc.error;
        }

        let out = (proc.stdout || '').trim() || (proc.stderr || '').trim();
        if (!out) {
            return res.status(500).json({ error: 'No output from metrics script' });
        }

        let parsed = {};
        try {
            parsed = JSON.parse(out);
        } catch (e) {
            return res.status(500).json({ error: 'Invalid JSON from metrics script' });
        }

        const comparison = parsed.comparison || {};
        const tuning = parsed.tuning || {};
        const hasEvaluation = comparison.depth_1 && comparison.depth_3 && tuning.n_samples;
        const tuningOutdated = typeof tuning.n_samples === 'number' && historyCount > tuning.n_samples;

        if (!hasEvaluation || tuningOutdated) {
            const trainProc = runTrain();
            if (trainProc.error) {
                throw trainProc.error;
            }

            const trainOut = (trainProc.stdout || '').trim() || (trainProc.stderr || '').trim();
            if (trainOut) {
                try {
                    const trainParsed = JSON.parse(trainOut);
                    console.log('[TRAIN] completed', trainParsed.success ? 'successfully' : 'with warnings');
                } catch (e) {
                    console.warn('[TRAIN] non-JSON output:', trainOut);
                }
            }

            proc = runMetrics();
            if (proc.error) {
                throw proc.error;
            }

            out = (proc.stdout || '').trim() || (proc.stderr || '').trim();
            if (!out) {
                return res.status(500).json({ error: 'No output from metrics script after retrain' });
            }

            try {
                parsed = JSON.parse(out);
            } catch (e) {
                return res.status(500).json({ error: 'Invalid JSON from metrics script after retrain' });
            }
        }

        console.log('[METRICS] parsed keys=', Object.keys(parsed || {}));
        res.json({ success: true, evaluation: parsed, refreshed: !hasEvaluation || tuningOutdated });

    } catch (error) {
        console.error('Error in /api/evaluation:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/export/csv - Export history ke CSV
 */
app.get('/api/export/csv', authMiddleware, (req, res) => {
    try {
        const csv = historyManager.exportToCSV();

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="kendala_history.csv"');
        res.send(csv);

    } catch (error) {
        console.error('Error in /api/export/csv:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * GET /api/export/xlsx - Export history to Excel
 */
app.get('/api/export/xlsx', authMiddleware, async (req, res) => {
    try {
        const history = historyManager.getHistory(1000);

        if (!history || history.length === 0) {
            return res.status(400).json({ error: 'No data to export' });
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Riwayat');

        sheet.columns = [
            { header: 'ID', key: 'id', width: 36 },
            { header: 'Timestamp', key: 'timestamp', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'TTIC', key: 'ttic', width: 20 },
            { header: 'TTD KB', key: 'ttd', width: 10 },
            { header: 'STO', key: 'sto', width: 10 },
            { header: 'Prioritas', key: 'prioritas', width: 12 },
            { header: 'Confidence', key: 'confidence', width: 12 },
            { header: 'Reasoning', key: 'reasoning', width: 50 }
        ];

        history.forEach(record => {
            sheet.addRow({
                id: record.id,
                timestamp: record.timestamp,
                status: record.input.status_hi || '',
                ttic: record.input.ttic || '',
                ttd: record.input.ttd_kb_num || '',
                sto: record.input.sto || '',
                prioritas: record.output.prioritas || '',
                confidence: record.output.confidence || '',
                reasoning: record.output.reasoning || ''
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="kendala_history.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting to XLSX:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/export/pdf - Export history to PDF
 */
app.get('/api/export/pdf', authMiddleware, (req, res) => {
    try {
        const history = historyManager.getHistory(1000);

        if (!history || history.length === 0) {
            return res.status(400).json({ error: 'No data to export' });
        }

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="kendala_history.pdf"');

        doc.pipe(res);

        doc.fontSize(16).text('Kendala History', { align: 'center' });
        doc.moveDown(1);

        const tableTop = 100;
        const itemHeight = 18;
        let y = tableTop;

        // Header
        doc.fontSize(10).text('Timestamp', 40, y);
        doc.text('Status', 150, y);
        doc.text('TTIC', 220, y);
        doc.text('TTD', 280, y);
        doc.text('Prioritas', 330, y);
        doc.text('Confidence', 420, y);
        y += itemHeight;

        history.forEach((record) => {
            if (y > doc.page.height - 60) {
                doc.addPage();
                y = 60;
            }

            doc.fontSize(9).text(new Date(record.timestamp).toLocaleString(), 40, y, { width: 100 });
            doc.text(record.input.status_hi || '-', 150, y, { width: 60 });
            doc.text(record.input.ttic || '-', 220, y, { width: 50 });
            doc.text(String(record.input.ttd_kb_num || '-'), 280, y, { width: 40 });
            doc.text(record.output.prioritas || '-', 330, y, { width: 80 });
            doc.text(String(Math.round((record.output.confidence || 0) * 100) + '%'), 420, y, { width: 60 });

            y += itemHeight;
        });

        doc.end();
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/categories - Ambil semua kategori yang tersedia
 */
app.get('/api/categories', authMiddleware, (req, res) => {
    try {
        const categories = classifier.getCategories();
        const targets = classifier.getTargets();

        res.json({
            success: true,
            categories,
            targets
        });
    } catch (error) {
        console.error('Error in /api/categories:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * DELETE /api/history/:recordId - Hapus record tertentu
 */
app.delete('/api/history/:recordId', authMiddleware, (req, res) => {
    try {
        const { recordId } = req.params;
        const deleted = historyManager.deleteRecord(recordId);

        if (deleted) {
            res.json({
                success: true,
                message: 'Record deleted successfully'
            });
        } else {
            res.status(404).json({
                error: 'Record not found'
            });
        }
    } catch (error) {
        console.error('Error in DELETE /api/history:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

/**
 * Serve frontend index.html untuk semua route yang tidak ada di API
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

/**
 * Start server
 */
function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`
    ╔══════════════════════════════════════════════════╗
    ║   ML CLASSIFICATION - BGES Telkom Pekanbaru      ║
    ║   Server running at http://localhost:${port}        ║
    ║   Environment: ${process.env.NODE_ENV || 'development'}                       ║
    ╚══════════════════════════════════════════════════╝
    `);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            console.warn(`Port ${port} sedang dipakai, mencoba port ${nextPort}...`);
            startServer(nextPort);
            return;
        }

        console.error('Server error:', error);
        process.exit(1);
    });
}

startServer(PORT);

module.exports = app;
