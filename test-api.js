/**
 * Test API Endpoints
 */

const API_BASE = 'http://localhost:3000/api';

async function testApis() {
    console.log('\n🧪 Testing ML Classification API\n');

    try {
        // Test 1: Health Check
        console.log('1️⃣  Testing /api/health...');
        let response = await fetch(`${API_BASE}/health`);
        let data = await response.json();
        console.log('✅ Health:', data);

        // Test 2: Classify - Scenario 1 (Prioritas Tinggi)
        console.log('\n2️⃣  Testing /api/classify (Prioritas Tinggi)...');
        response = await fetch(`${API_BASE}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status_hi: 'Open',
                ttic: '1x24 jam',
                ttd_kb_num: 100,
                sto: 'STO Pekanbaru'
            })
        });
        data = await response.json();
        console.log('✅ Classification:', JSON.stringify(data, null, 2));

        // Test 3: Classify - Scenario 2 (Prioritas Sedang)
        console.log('\n3️⃣  Testing /api/classify (Prioritas Sedang)...');
        response = await fetch(`${API_BASE}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status_hi: 'In Progress',
                ttic: '>3x24 jam',
                ttd_kb_num: 50,
                sto: 'STO 2'
            })
        });
        data = await response.json();
        console.log('✅ Classification:', JSON.stringify(data, null, 2));

        // Test 4: Statistics
        console.log('\n4️⃣  Testing /api/statistics...');
        response = await fetch(`${API_BASE}/statistics`);
        data = await response.json();
        console.log('✅ Statistics:', JSON.stringify(data, null, 2));

        // Test 5: History
        console.log('\n5️⃣  Testing /api/history...');
        response = await fetch(`${API_BASE}/history?limit=10`);
        data = await response.json();
        console.log('✅ History count:', data.count);
        console.log('✅ Last 3 records:');
        data.data.slice(0, 3).forEach((record, i) => {
            console.log(`   ${i + 1}. ${record.output.prioritas} - ${record.output.confidence}`);
        });

        // Test 6: Categories
        console.log('\n6️⃣  Testing /api/categories...');
        response = await fetch(`${API_BASE}/categories`);
        data = await response.json();
        console.log('✅ Categories:', JSON.stringify(data, null, 2));

        console.log('\n✨ All tests completed successfully!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run tests
testApis();
