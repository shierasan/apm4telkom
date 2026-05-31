/**
 * History Manager - menyimpan dan membaca riwayat klasifikasi.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const HISTORY_FILE = path.join(__dirname, '../data/history.json');

class HistoryManager {
    constructor() {
        this.ensureHistoryFile();
    }

    /** Pastikan file history ada. */
    ensureHistoryFile() {
        if (!fs.existsSync(HISTORY_FILE)) {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
        }
    }

    /** Tambah record klasifikasi ke history. */
    addRecord(data) {
        try {
            const history = this.getHistory();
            const record = {
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                input: data.input,
                output: data.output,
                user: data.user || 'System'
            };
            
            history.push(record);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
            
            return record;
        } catch (error) {
            console.error('Error adding record:', error);
            throw error;
        }
    }

    /** Ambil history terbaru. */
    getHistory(limit = 1000) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const history = JSON.parse(data);
            return history
                .slice()
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, limit);
        } catch (error) {
            console.error('Error reading history:', error);
            return [];
        }
    }

    /** Ambil history dengan pagination dan filter opsional. */
    getHistoryPage({ page = 1, limit = 25, priority = '' } = {}) {
        try {
            const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
            const normalizedLimit = Math.max(1, parseInt(limit, 10) || 25);
            let history = this.getHistory(1000);

            if (priority) {
                history = history.filter(record => record.output?.prioritas === priority);
            }

            const total = history.length;
            const totalPages = Math.max(1, Math.ceil(total / normalizedLimit));
            const currentPage = Math.min(normalizedPage, totalPages);
            const start = (currentPage - 1) * normalizedLimit;
            const data = history.slice(start, start + normalizedLimit);

            return {
                data,
                total,
                page: currentPage,
                limit: normalizedLimit,
                totalPages
            };
        } catch (error) {
            console.error('Error reading paged history:', error);
            return {
                data: [],
                total: 0,
                page: 1,
                limit: 25,
                totalPages: 1
            };
        }
    }

    /** Ambil history dengan filter prioritas. */
    getHistoryByPriority(priority) {
        try {
            const history = this.getHistory(1000);
            return history.filter(record => record.output.prioritas === priority);
        } catch (error) {
            console.error('Error filtering history:', error);
            return [];
        }
    }

    /** Hitung statistik dari history. */
    getStatistics() {
        try {
            const history = this.getHistory(1000);
            
            const stats = {
                total: history.length,
                byPriority: {
                    'Tinggi': 0,
                    'Sedang': 0,
                    'Rendah': 0
                },
                avgConfidence: 0,
                lastUpdated: new Date().toISOString()
            };

            let totalConfidence = 0;

            history.forEach(record => {
                const prioritas = record.output.prioritas;
                if (stats.byPriority[prioritas] !== undefined) {
                    stats.byPriority[prioritas]++;
                }
                totalConfidence += record.output.confidence || 0;
            });

            stats.avgConfidence = history.length > 0 
                ? (totalConfidence / history.length).toFixed(2)
                : 0;

            return stats;
        } catch (error) {
            console.error('Error calculating statistics:', error);
            return {
                total: 0,
                byPriority: { 'Tinggi': 0, 'Sedang': 0, 'Rendah': 0 },
                avgConfidence: 0
            };
        }
    }

    /** Hapus record tertentu. */
    deleteRecord(recordId) {
        try {
            let history = this.getHistory(1000);
            history = history.filter(record => record.id !== recordId);
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting record:', error);
            return false;
        }
    }

    /** Hapus banyak record sekaligus. */
    deleteRecords(recordIds = []) {
        try {
            const ids = new Set((recordIds || []).filter(Boolean));
            let history = this.getHistory(1000);
            history = history.filter(record => !ids.has(record.id));
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
            return true;
        } catch (error) {
            console.error('Error deleting records:', error);
            return false;
        }
    }

    /** Export history ke CSV. */
    exportToCSV() {
        try {
            const history = this.getHistory(1000);
            
            if (history.length === 0) {
                return 'No data to export';
            }

            const lines = [
                'LAPORAN RIWAYAT KLASIFIKASI',
                `Generated At,"${new Date().toLocaleString('id-ID').replace(/"/g, '""')}"`,
                `Total Records,${history.length}`,
                '',
                'No,Timestamp,Status HI,TTIC,TTD KB,STO,Prioritas,Confidence,Alasan'
            ];

            history.forEach((record, index) => {
                const { id, timestamp, input, output } = record;
                const row = [
                    index + 1,
                    timestamp,
                    input.status_hi || '',
                    input.ttic || '',
                    input.ttd_kb_num || '',
                    input.sto || '',
                    output.prioritas || '',
                    output.confidence || '',
                    output.reasoning || ''
                ].map(value => this.escapeCsvCell(value)).join(',');
                lines.push(row);
            });

            return lines.join('\n');
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            throw error;
        }
    }

    escapeCsvCell(value) {
        const text = String(value ?? '');
        if (/[",\n]/.test(text)) {
            return '"' + text.replace(/"/g, '""') + '"';
        }
        return text;
    }

    /** Clear semua history (untuk development). */
    clearHistory() {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
            return true;
        } catch (error) {
            console.error('Error clearing history:', error);
            return false;
        }
    }
}

module.exports = HistoryManager;
