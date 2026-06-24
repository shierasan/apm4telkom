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

function normalizeText(value) {
    return String(value || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeStatusHi(value) {
    const text = normalizeText(value).toLowerCase();
    if (!text) return '';
    if (text.includes('progress') || text === 'open') return 'In Progress';
    if (text.includes('reject')) return 'Rejected';
    if (text.includes('close')) return 'Closed';
    if (text.includes('in progress')) return 'In Progress';
    return normalizeText(value);
}

function normalizeTtic(value) {
    const text = normalizeText(value).toLowerCase();
    if (!text) return '';
    if (text.includes('1x24')) return '1x24 jam';
    if (text.includes('2x24')) return '2x24 jam';
    if (text.includes('3x24') || text.includes('>3x24') || text.includes('lebih dari 3x24')) return '>3x24 jam';
    return normalizeText(value);
}

function normalizeSto(value) {
    return normalizeText(value);
}

function normalizeAlphaText(value) {
    return normalizeText(value);
}

function assertAlphaText(value, label) {
    return normalizeText(value);
}

function normalizeBatchInput(row = {}) {
    const ttd = Number.parseInt(String(row?.ttd_kb_num ?? row?.ttd ?? 0).replace(/[^0-9-]/g, ''), 10);
    return {
        nama_masalah: normalizeAlphaText(row?.nama_masalah),
        keterangan_masalah: normalizeAlphaText(row?.keterangan_masalah),
        nama_teknisi: normalizeAlphaText(row?.nama_teknisi),
        status_hi: normalizeStatusHi(row?.status_hi),
        ttic: normalizeTtic(row?.ttic),
        ttd_kb_num: Number.isFinite(ttd) ? ttd : 0,
        sto: normalizeSto(row?.sto)
    };
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
        const rawBody = req.body || {};
        const payload = normalizeBatchInput({
            ...rawBody,
            nama_masalah: assertAlphaText(rawBody.nama_masalah, 'Nama Masalah'),
            keterangan_masalah: assertAlphaText(rawBody.keterangan_masalah, 'Keterangan Masalah'),
            nama_teknisi: assertAlphaText(rawBody.nama_teknisi, 'Nama Teknisi')
        });

        // Validasi input
        if (!payload.status_hi || !payload.ttic || payload.ttd_kb_num === undefined) {
            return res.status(400).json({
                error: 'Input tidak lengkap. Diperlukan: status_hi, ttic, ttd_kb_num'
            });
        }

        // Klasifikasi
        const result = classifier.klassifikasiPrioritas({
            status_hi: payload.status_hi,
            ttic: payload.ttic,
            ttd_kb_num: parseInt(payload.ttd_kb_num),
            sto: payload.sto || 'Unknown'
        });

        // Simpan ke history
        const historyRecord = historyManager.addRecord({
            input: payload,
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
            nama_masalah: findHeaderIndex(header, ['nama_masalah', 'nama masalah', 'judul masalah', 'problem name']),
            keterangan_masalah: findHeaderIndex(header, ['keterangan_masalah', 'keterangan masalah', 'deskripsi masalah', 'detail masalah']),
            nama_teknisi: findHeaderIndex(header, ['nama_teknisi', 'nama teknisi', 'teknisi']),
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
            const payload = normalizeBatchInput({
                nama_masalah: idx.nama_masalah !== -1 ? (cols[idx.nama_masalah] || '') : '',
                keterangan_masalah: idx.keterangan_masalah !== -1 ? (cols[idx.keterangan_masalah] || '') : '',
                nama_teknisi: idx.nama_teknisi !== -1 ? (cols[idx.nama_teknisi] || '') : '',
                status_hi: idx.status_hi !== -1 ? (cols[idx.status_hi] || '') : '',
                ttic: idx.ttic !== -1 ? (cols[idx.ttic] || '') : '',
                ttd_kb_num: idx.ttd !== -1 ? (parseInt(cols[idx.ttd]) || 0) : 0,
                sto: idx.sto !== -1 ? (cols[idx.sto] || '') : ''
            });

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
            const payload = normalizeBatchInput(row);

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
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
        const priority = String(req.query.priority || '').trim();
        const paged = historyManager.getHistoryPage({ page, limit, priority });

        res.json({
            success: true,
            count: paged.data.length,
            total: paged.total,
            page: paged.page,
            limit: paged.limit,
            totalPages: paged.totalPages,
            data: paged.data
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

        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 25;
        const paged = historyManager.getHistoryPage({ page, limit, priority });

        res.json({
            success: true,
            priority,
            count: paged.data.length,
            total: paged.total,
            page: paged.page,
            limit: paged.limit,
            totalPages: paged.totalPages,
            data: paged.data
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

function getHistoryReportMeta(history) {
    const total = history.length;
    const byPriority = history.reduce((acc, record) => {
        const priority = record.output?.prioritas || '-';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { Tinggi: 0, Sedang: 0, Rendah: 0 });

    return {
        title: 'LAPORAN RIWAYAT KLASIFIKASI',
        generatedAt: new Date().toLocaleString('id-ID'),
        total,
        byPriority
    };
}

function getHistoryReportRows(history) {
    return history.map((record, index) => ({
        no: index + 1,
        timestamp: new Date(record.timestamp).toLocaleString('id-ID'),
        status_hi: record.input?.status_hi || '-',
        ttic: record.input?.ttic || '-',
        ttd_kb_num: record.input?.ttd_kb_num ?? '-',
        sto: record.input?.sto || '-',
        prioritas: record.output?.prioritas || '-',
        confidence: `${Math.round((record.output?.confidence || 0) * 100)}%`,
        reasoning: record.output?.reasoning || '-'
    }));
}

function styleWorksheetCell(cell, options = {}) {
    if (options.fill) cell.fill = options.fill;
    if (options.font) cell.font = options.font;
    if (options.alignment) cell.alignment = options.alignment;
    if (options.border) cell.border = options.border;
}

function getTableBorder() {
    return {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };
}

function drawPdfHeader(doc, meta) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const headerHeight = 78;
    const x = doc.page.margins.left;
    const y = doc.y;

    doc.save();
    doc.rect(x, y, pageWidth, headerHeight).fill('#d72626');
    doc.fillColor('#ffffff');
    doc.font('Helvetica-Bold').fontSize(18).text(meta.title, x, y + 16, {
        align: 'center',
        width: pageWidth
    });
    doc.font('Helvetica').fontSize(9).text(`Tanggal Laporan: ${meta.generatedAt}`, x, y + 42, {
        align: 'center',
        width: pageWidth
    });
    doc.restore();
    doc.y = y + headerHeight + 14;
}

function drawPdfSummary(doc, meta) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const boxY = doc.y;
    const boxHeight = 38;
    const x = doc.page.margins.left;

    doc.save();
    doc.roundedRect(x, boxY, pageWidth, boxHeight, 8).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(`Total Data: ${meta.total} records`, x + 12, boxY + 12);
    doc.fillColor('#6b7280').font('Helvetica').fontSize(8.5).text(`Tinggi: ${meta.byPriority.Tinggi}  |  Sedang: ${meta.byPriority.Sedang}  |  Rendah: ${meta.byPriority.Rendah}`, x + 12, boxY + 24);
    doc.restore();
    doc.y = boxY + boxHeight + 12;
}

function drawPdfTableHeader(doc, columns, widths) {
    const x = doc.page.margins.left;
    let cursorX = x;
    const y = doc.y;
    const headerHeight = 24;

    for (let i = 0; i < columns.length; i++) {
        doc.rect(cursorX, y, widths[i], headerHeight).fillAndStroke('#d72626', '#b91c1c');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text(columns[i], cursorX + 4, y + 7, {
            width: widths[i] - 8,
            align: 'center'
        });
        cursorX += widths[i];
    }

    doc.y = y + headerHeight;
}

function drawPdfTableRow(doc, row, widths, columns) {
    const x = doc.page.margins.left;
    const values = [row.no, row.timestamp, row.status_hi, row.ttic, row.ttd_kb_num, row.sto, row.prioritas, row.confidence, row.reasoning];
    const rowPadding = 4;
    let rowY = doc.y;
    const alignments = ['center', 'left', 'left', 'center', 'center', 'left', 'center', 'center', 'left'];
    const texts = values.map((value, index) => index === 8 ? String(value ?? '').replace(/\s+/g, ' ').trim() : truncatePdfCell(value, widths[index], index));
    let rowHeight = 22;

    doc.font('Helvetica').fontSize(8);
    texts.forEach((text, index) => {
        const contentWidth = widths[index] - rowPadding * 2;
        const textHeight = doc.heightOfString(text || '-', {
            width: contentWidth,
            align: alignments[index],
            lineGap: 1
        });
        rowHeight = Math.max(rowHeight, Math.ceil(textHeight + rowPadding * 2));
    });

    if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        doc.fillColor('#111827');
        drawPdfTableHeader(doc, columns, widths);
        rowY = doc.y;
    }

    let cursorX = x;
    for (let i = 0; i < texts.length; i++) {
        doc.rect(cursorX, rowY, widths[i], rowHeight).stroke('#d1d5db');
        doc.save();
        doc.fillColor('#111827').font('Helvetica').fontSize(8);
        doc.rect(cursorX + 1, rowY + 1, widths[i] - 2, rowHeight - 2).clip();
        doc.text(texts[i] || '-', cursorX + rowPadding, rowY + rowPadding, {
            width: widths[i] - rowPadding * 2,
            height: rowHeight - rowPadding * 2,
            align: alignments[i],
            lineBreak: true,
            paragraphGap: 0,
            wordSpacing: 0,
            characterSpacing: 0,
            ellipsis: i !== 8
        });
        doc.restore();
        cursorX += widths[i];
    }

    doc.y = rowY + rowHeight;
}

function truncatePdfCell(value, width, index) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    const limits = [6, 24, 16, 14, 10, 12, 12, 10, 42];
    const limit = limits[index] || 20;
    if (!text) return '-';
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

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
        res.setHeader('Content-Disposition', 'attachment; filename="laporan_riwayat_klasifikasi.csv"');
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

        const meta = getHistoryReportMeta(history);
        const rows = getHistoryReportRows(history);
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Riwayat');

        sheet.columns = [
            { header: 'No', key: 'no', width: 6 },
            { header: 'Timestamp', key: 'timestamp', width: 26 },
            { header: 'Status HI', key: 'status_hi', width: 16 },
            { header: 'TTIC', key: 'ttic', width: 18 },
            { header: 'TTD KB', key: 'ttd_kb_num', width: 12 },
            { header: 'STO', key: 'sto', width: 12 },
            { header: 'Prioritas', key: 'prioritas', width: 14 },
            { header: 'Confidence', key: 'confidence', width: 12 },
            { header: 'Alasan', key: 'reasoning', width: 48 }
        ];

        sheet.mergeCells('A1:I1');
        sheet.getCell('A1').value = meta.title;
        styleWorksheetCell(sheet.getCell('A1'), {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD72626' } },
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 },
            alignment: { horizontal: 'center', vertical: 'middle' }
        });

        sheet.mergeCells('A2:I2');
        sheet.getCell('A2').value = `Tanggal Laporan: ${meta.generatedAt}`;
        styleWorksheetCell(sheet.getCell('A2'), {
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } },
            font: { italic: true, color: { argb: 'FF7F1D1D' } },
            alignment: { horizontal: 'center' }
        });

        sheet.mergeCells('A3:I3');
        sheet.getCell('A3').value = `Total Data: ${meta.total} records | Tinggi: ${meta.byPriority.Tinggi} | Sedang: ${meta.byPriority.Sedang} | Rendah: ${meta.byPriority.Rendah}`;
        styleWorksheetCell(sheet.getCell('A3'), {
            font: { bold: true, color: { argb: 'FF374151' } },
            alignment: { horizontal: 'center' }
        });

        sheet.getRow(5).values = ['No', 'Timestamp', 'Status HI', 'TTIC', 'TTD KB', 'STO', 'Prioritas', 'Confidence', 'Alasan'];
        sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD72626' } };
        sheet.getRow(5).alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(5).height = 22;

        rows.forEach(row => {
            const added = sheet.addRow(row);
            added.alignment = { vertical: 'top', wrapText: true };
            added.eachCell((cell) => {
                styleWorksheetCell(cell, {
                    border: getTableBorder(),
                    alignment: { vertical: 'top', wrapText: true }
                });
            });
        });

        sheet.getRow(5).eachCell((cell) => {
            styleWorksheetCell(cell, {
                border: getTableBorder(),
                alignment: { horizontal: 'center', vertical: 'middle' }
            });
        });

        sheet.autoFilter = {
            from: 'A5',
            to: 'I5'
        };

        sheet.views = [{ state: 'frozen', ySplit: 5 }];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 6) {
                row.height = 20;
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="laporan_riwayat_klasifikasi.xlsx"');

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

        const meta = getHistoryReportMeta(history);
        const rows = getHistoryReportRows(history);
        const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="laporan_riwayat_klasifikasi.pdf"');

        doc.pipe(res);

        drawPdfHeader(doc, meta);
        drawPdfSummary(doc, meta);

        const columns = ['No', 'Timestamp', 'Status HI', 'TTIC', 'TTD KB', 'STO', 'Prioritas', 'Confidence', 'Alasan'];
        const widths = [30, 100, 70, 70, 55, 45, 65, 60, 266];

        drawPdfTableHeader(doc, columns, widths);
        rows.forEach((row) => drawPdfTableRow(doc, row, widths, columns));

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
 * DELETE /api/history - Hapus beberapa record sekaligus
 * Body: { ids: ["id1", "id2", ...] }
 */
app.delete('/api/history', authMiddleware, (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (!ids.length) {
            return res.status(400).json({ error: 'ids kosong. Kirim body.ids berupa array' });
        }

        const deleted = historyManager.deleteRecords(ids);
        if (deleted) {
            return res.json({ success: true, message: 'Selected records deleted successfully', deletedCount: ids.length });
        }

        res.status(404).json({ error: 'Records not found' });
    } catch (error) {
        console.error('Error in DELETE /api/history batch:', error);
        res.status(500).json({ error: error.message });
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
