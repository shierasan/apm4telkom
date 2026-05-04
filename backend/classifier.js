/**
 * Decision Tree Classifier untuk Prioritas Kendala
 * Based on ML Model dari notebook
 */

class KendalaClassifier {
    constructor() {
        this.labelEncoders = {
            status: ['Assigned', 'Closed', 'In Progress', 'Open', 'Rejected'],
            ttic: ['>3x24 jam', '1x24 jam', '2x24 jam'],
            sto: ['STO 1', 'STO 2', 'STO 3', 'STO 4', 'STO 5'] // Contoh
        };
        this.targets = ['Rendah', 'Sedang', 'Tinggi'];
    }

    /**
     * Fungsi utama untuk klasifikasi prioritas
     */
    klassifikasiPrioritas(params) {
        const {
            status_hi,
            ttic,
            ttd_kb_num,
            sto
        } = params;

        // Validasi input
        if (!status_hi || !ttic || ttd_kb_num === undefined) {
            throw new Error('Input tidak lengkap');
        }

        // Normalisasi input
        const statusLower = String(status_hi).toLowerCase().trim();
        const tticLower = String(ttic).toLowerCase().trim();
        const kontrak = parseInt(ttd_kb_num) || 0;

        // Rule-based decision tree logic dari notebook
        const result = this.decisionTreeLogic(statusLower, tticLower, kontrak);

        return {
            prioritas: result.prioritas,
            confidence: result.confidence,
            reasoning: result.reasoning
        };
    }

    /**
     * Decision Tree Logic berdasarkan dari ML model notebook
     */
    decisionTreeLogic(status, ttic, kontrak) {
        // Rule 1: Status Closed atau Rejected
        if (status === 'closed' || status === 'rejected') {
            return {
                prioritas: 'Rendah',
                confidence: 0.95,
                reasoning: 'Kendala sudah ditutup atau ditolak'
            };
        }

        // PRIORITAS TINGGI
        // Rule: 1x24 jam = paling urgent
        if (ttic === '1x24 jam') {
            return {
                prioritas: 'Tinggi',
                confidence: 0.98,
                reasoning: 'SLA 1x24 jam merupakan prioritas tertinggi'
            };
        }

        // Rule: 2x24 jam + kontrak besar (>= 90)
        if (ttic === '2x24 jam' && kontrak >= 90) {
            return {
                prioritas: 'Tinggi',
                confidence: 0.92,
                reasoning: 'SLA 2x24 jam dengan kontrak pelanggan besar'
            };
        }

        // Rule: >3x24 jam + kontrak besar (>= 90) = overdue
        if (ttic === '>3x24 jam' && kontrak >= 90) {
            return {
                prioritas: 'Tinggi',
                confidence: 0.90,
                reasoning: 'Overdue dengan kontrak pelanggan penting'
            };
        }

        // PRIORITAS SEDANG
        // Rule: 2x24 jam tanpa kontrak besar
        if (ttic === '2x24 jam') {
            return {
                prioritas: 'Sedang',
                confidence: 0.85,
                reasoning: 'SLA 2x24 jam, kontrak standar'
            };
        }

        // Rule: >3x24 jam (tidak terlalu kritis)
        if (ttic === '>3x24 jam') {
            return {
                prioritas: 'Sedang',
                confidence: 0.80,
                reasoning: 'SLA >3x24 jam, masih dalam batas waktu'
            };
        }

        // PRIORITAS RENDAH (default)
        return {
            prioritas: 'Rendah',
            confidence: 0.70,
            reasoning: 'Kriteria tidak sesuai dengan prioritas tinggi atau sedang'
        };
    }

    /**
     * Encode kategori ke angka
     */
    encodeCategory(value, categoryType) {
        const categories = this.labelEncoders[categoryType];
        if (!categories) return -1;
        
        const index = categories.indexOf(value);
        return index !== -1 ? index : -1;
    }

    /**
     * Decode angka ke kategori
     */
    decodeCategory(value, categoryType) {
        const categories = this.labelEncoders[categoryType];
        if (!categories || value < 0 || value >= categories.length) return null;
        return categories[value];
    }

    /**
     * Get semua kategori yang tersedia
     */
    getCategories() {
        return this.labelEncoders;
    }

    /**
     * Get semua target/prioritas yang tersedia
     */
    getTargets() {
        return this.targets;
    }
}

module.exports = KendalaClassifier;
