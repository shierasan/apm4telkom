const fs = require('fs');
const path = require('path');

// Support both old and new naming conventions for depth-3 model
const candidates = [path.join(__dirname, '..', 'model_depth3.joblib'), path.join(__dirname, '..', 'model_d3.joblib')];
let src = null;
for (const c of candidates) {
    if (fs.existsSync(c)) { src = c; break; }
}

if (!src) {
    console.error('Source model (depth3) does not exist. Tried:', candidates.join(', '));
    process.exit(1);
}

const dest = path.join(__dirname, '..', 'model_production.joblib');
fs.copyFileSync(src, dest);
// Also keep legacy `model.joblib` for compatibility
const legacy = path.join(__dirname, '..', 'model.joblib');
try { fs.copyFileSync(src, legacy); } catch (e) { /* ignore */ }

console.log('Production model set to', src);
