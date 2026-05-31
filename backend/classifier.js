/**
 * Decision Tree classifier untuk prioritas kendala.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class KendalaClassifier {
    constructor() {
        this.python = process.env.PYTHON_PATH || 'python';
        this.modelScript = path.join(__dirname, 'model_service.py');
    }

    /** Jalankan Python model service untuk prediksi. */
    klassifikasiPrioritas(params) {
        const payload = {
            status_hi: params.status_hi || '',
            ttic: params.ttic || '',
            ttd_kb_num: parseInt(params.ttd_kb_num || 0),
            sto: params.sto || ''
        };

        // Kirim payload ke Python via stdin.
        const proc = spawnSync(this.python, [this.modelScript, 'predict'], {
            input: JSON.stringify(payload),
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });

        if (proc.error) {
            throw new Error(`Failed to run Python: ${proc.error.message}`);
        }

        const out = (proc.stdout || '').trim();
        if (!out) {
            const err = (proc.stderr || '').trim();
            throw new Error(`Python model returned no output. stderr: ${err}`);
        }

        let parsed;
        try {
            parsed = JSON.parse(out);
        } catch (e) {
            throw new Error(`Invalid JSON from model: ${e.message} -- raw: ${out}`);
        }

        if (parsed.error) {
            throw new Error(`Model error: ${parsed.error} ${parsed.details || ''}`);
        }

        // Tetap kompatibel dengan API lama.
        return {
            prioritas: parsed.prioritas || 'Rendah',
            confidence: parsed.confidence || 0,
            reasoning: parsed.reasoning || null,
            probabilities: parsed.probabilities || null,
            feature_importances: parsed.feature_importances || null
        };
    }

    /** Jalankan training model jika diperlukan. */
    trainModel() {
        const proc = spawnSync(this.python, [this.modelScript, 'train'], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });

        if (proc.error) {
            throw new Error(`Failed to run Python train: ${proc.error.message}`);
        }

        let parsed;
        try {
            parsed = JSON.parse((proc.stdout || '').trim() || (proc.stderr || '').trim());
        } catch (e) {
            throw new Error(`Invalid JSON from model train: ${e.message}`);
        }

        if (parsed.error) {
            throw new Error(`Model train error: ${parsed.error}`);
        }

        return parsed;
    }

    /** Ambil kategori input dari data history. */
    getCategories() {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'history.json');
            if (!fs.existsSync(dataPath)) return {};
            const raw = fs.readFileSync(dataPath, 'utf8');
            const arr = JSON.parse(raw);
            const cats = { status: new Set(), ttic: new Set(), sto: new Set() };
            arr.forEach(r => {
                const inp = r.input || {};
                if (inp.status_hi) cats.status.add(inp.status_hi);
                if (inp.ttic) cats.ttic.add(inp.ttic);
                if (inp.sto) cats.sto.add(inp.sto);
            });

            return {
                status: Array.from(cats.status),
                ttic: Array.from(cats.ttic),
                sto: Array.from(cats.sto)
            };
        } catch (e) {
            return {};
        }
    }

    /** Ambil label target yang pernah muncul di history. */
    getTargets() {
        try {
            const dataPath = path.join(__dirname, '..', 'data', 'history.json');
            if (!fs.existsSync(dataPath)) return [];
            const raw = fs.readFileSync(dataPath, 'utf8');
            const arr = JSON.parse(raw);
            const set = new Set();
            arr.forEach(r => { if (r.output && r.output.prioritas) set.add(r.output.prioritas); });
            return Array.from(set);
        } catch (e) {
            return [];
        }
    }
}

module.exports = KendalaClassifier;
