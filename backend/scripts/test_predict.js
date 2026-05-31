const KendalaClassifier = require('../classifier');

async function main(){
    const clf = new KendalaClassifier();

    const sample = {
        status_hi: 'In Progress',
        ttic: '2x24 jam',
        ttd_kb_num: 70,
        sto: 'DUM'
    };

    try {
        const out = clf.klassifikasiPrioritas(sample);
        console.log('Prediction result:', JSON.stringify(out, null, 2));
    } catch (e) {
        console.error('Error during prediction:', e.message);
        process.exit(1);
    }
}

main();
