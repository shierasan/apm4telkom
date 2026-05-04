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
app.post('/api/classify', (req, res) => {
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
 * GET /api/history - Ambil riwayat klasifikasi
 */
app.get('/api/history', (req, res) => {
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
app.get('/api/history/priority/:priority', (req, res) => {
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
app.get('/api/statistics', (req, res) => {
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
 * GET /api/export/csv - Export history ke CSV
 */
app.get('/api/export/csv', (req, res) => {
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
 * GET /api/categories - Ambil semua kategori yang tersedia
 */
app.get('/api/categories', (req, res) => {
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
app.delete('/api/history/:recordId', (req, res) => {
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
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║   ML CLASSIFICATION - BGES Telkom Pekanbaru     ║
    ║   Server running at http://localhost:${PORT}       ║
    ║   Environment: ${process.env.NODE_ENV || 'development'}              ║
    ╚══════════════════════════════════════════════════╝
    `);
});

module.exports = app;
