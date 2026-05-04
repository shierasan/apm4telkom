/**
 * History Manager - Mengelola riwayat klasifikasi kendala
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const HISTORY_FILE = path.join(__dirname, '../data/history.json');

class HistoryManager {
    constructor() {
        this.ensureHistoryFile();
    }

    /**
     * Pastikan file history ada
     */
    ensureHistoryFile() {
        if (!fs.existsSync(HISTORY_FILE)) {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
        }
    }

    /**
     * Tambah record klasifikasi ke history
     */
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

    /**
     * Ambil semua history
     */
    getHistory(limit = 1000) {
        try {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const history = JSON.parse(data);
            return history.slice(-limit).reverse();
        } catch (error) {
            console.error('Error reading history:', error);
            return [];
        }
    }

    /**
     * Ambil history dengan filter
     */
    getHistoryByPriority(priority) {
        try {
            const history = this.getHistory(1000);
            return history.filter(record => record.output.prioritas === priority);
        } catch (error) {
            console.error('Error filtering history:', error);
            return [];
        }
    }

    /**
     * Hitung statistik dari history
     */
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

    /**
     * Hapus record tertentu
     */
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

    /**
     * Export history ke CSV format
     */
    exportToCSV() {
        try {
            const history = this.getHistory(1000);
            
            if (history.length === 0) {
                return 'No data to export';
            }

            let csv = 'ID,Timestamp,Status,TTIC,TTD KB,STO,Prioritas,Confidence,Reasoning\n';

            history.forEach(record => {
                const { id, timestamp, input, output } = record;
                const row = [
                    id,
                    timestamp,
                    input.status_hi || '',
                    input.ttic || '',
                    input.ttd_kb_num || '',
                    input.sto || '',
                    output.prioritas || '',
                    output.confidence || '',
                    (output.reasoning || '').replace(/,/g, ';')
                ].join(',');
                csv += row + '\n';
            });

            return csv;
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            throw error;
        }
    }

    /**
     * Clear semua history (untuk development)
     */
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
