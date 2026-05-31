const axios = require('axios');

async function run() {
  try {
    const base = 'http://localhost:3000';

    // Login
    const loginRes = await axios.post(`${base}/api/login`, {
      username: 'admin',
      password: 'admin'
    }, { timeout: 5000 });

    const token = loginRes.data.token;
    console.log('Got token:', token);

    // Call classify
    const payload = {
      status_hi: 'In Progress',
      ttic: '2x24 jam',
      ttd_kb_num: 70,
      sto: 'DUM'
    };

    const classifyRes = await axios.post(`${base}/api/classify`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    console.log('Classification response:', JSON.stringify(classifyRes.data, null, 2));
  } catch (e) {
    console.error('API flow error:', e.response ? e.response.data : e.message);
    process.exit(1);
  }
}

run();
