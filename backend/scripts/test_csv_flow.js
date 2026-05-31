const axios = require('axios');

async function run(){
  try{
    const base = 'http://localhost:3000';
    const loginRes = await axios.post(`${base}/api/login`, { username: 'admin', password: 'admin' });
    const token = loginRes.data.token;
    console.log('Token:', token);

    const csv = `status_hi,ttic,ttd_kb_num,sto
"In Progress",1x24 jam,10,PBR
"Closed",2x24 jam,90,DUM
"Rejected",">3x24 jam",120,RGT
`;

    const res = await axios.post(`${base}/api/classify/csv-text`, { csv }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    console.log('CSV result:', JSON.stringify(res.data, null, 2));
  }catch(e){ console.error('CSV flow error:', e.response ? e.response.data : e.message); process.exit(1); }
}

run();
