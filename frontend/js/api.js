// Simple API wrapper attached to window.api
(function(){
  const BASE = `${window.location.origin}/api`;

  async function request(path, opts = {}){
    opts = opts || {};
    opts.headers = opts.headers || {};

    const token = localStorage.getItem('auth_token');
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    // default JSON
    if (!(opts.body instanceof FormData) && !opts.headers['Content-Type']){
      opts.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(BASE + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch(e){ data = { raw: text }; }
    if (!res.ok) throw data;
    return data;
  }

  window.api = {
    login: (u,p) => request('/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }),
    logout: () => request('/logout', { method: 'POST' }),
    classify: (payload) => request('/classify', { method: 'POST', body: JSON.stringify(payload) }),
    classifyCsvText: (csvText) => request('/classify/csv-text', { method: 'POST', body: JSON.stringify({ csv: csvText }) }),
    classifyBatch: (rows) => request('/classify/batch', { method: 'POST', body: JSON.stringify({ rows }) }),
    getStatistics: () => request('/statistics'),
    getHistory: (limit=100) => request(`/history?limit=${limit}`),
    getHistoryByPriority: (p) => request(`/history/priority/${encodeURIComponent(p)}`),
    deleteRecord: (id) => request(`/history/${id}`, { method: 'DELETE' }),
    exportCsv: () => request('/export/csv'),
    exportXlsx: () => request('/export/xlsx'),
    exportPdf: () => request('/export/pdf'),
    getEvaluation: () => request('/evaluation')
  };
})();
