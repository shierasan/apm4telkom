(function () {
  let chartPriority = null;
  let chartConfidence = null;
  let chartFeatureImportance = null;
  let chartDepthCompare = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const page = document.body?.dataset?.page || 'dashboard';
    hideLoading();

    switch (page) {
      case 'classifier':
        bindClassifierForm();
        bindCsvUpload();
        loadStatistics();
        setInterval(loadStatistics, 30000);
        break;
      case 'evaluation':
        bindEvaluationRefresh();
        loadEvaluation();
        loadStatistics();
        setInterval(loadEvaluation, 60000);
        break;
      case 'history':
        bindHistoryControls();
        loadHistory();
        break;
      case 'profile':
        renderProfileCard();
        break;
      case 'dashboard':
      default:
        loadStatistics();
        setInterval(loadStatistics, 30000);
        break;
    }

    hideLoading();
  }

  function bindClassifierForm() {
    const form = document.getElementById('classifierForm');
    if (form) form.addEventListener('submit', handleClassify);
  }

  function bindCsvUpload() {
    const csvBtn = document.getElementById('processCsvBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', (event) => {
        event.preventDefault();
        handleCsvUpload();
      });
    }
  }

  function bindEvaluationRefresh() {
    const refreshBtn = document.getElementById('refreshEvaluationBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (event) => {
        event.preventDefault();
        loadEvaluation();
      });
    }
  }

  function bindHistoryControls() {
    const filter = document.getElementById('filterPriority');
    if (filter) filter.addEventListener('change', loadHistory);

    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadHistory);

    const exportCsv = document.getElementById('exportCsvBtn');
    if (exportCsv) exportCsv.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/csv', 'kendala_history.csv');
    });

    const exportXlsx = document.getElementById('exportXlsxBtn');
    if (exportXlsx) exportXlsx.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/xlsx', 'kendala_history.xlsx');
    });

    const exportPdf = document.getElementById('exportPdfBtn');
    if (exportPdf) exportPdf.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/pdf', 'kendala_history.pdf');
    });
  }

  async function handleClassify(event) {
    event.preventDefault();

    try {
      showLoading();
      const payload = {
        status_hi: document.getElementById('status_hi').value,
        ttic: document.getElementById('ttic').value,
        ttd_kb_num: parseInt(document.getElementById('ttd_kb_num').value, 10) || 0,
        sto: document.getElementById('sto').value
      };

      const data = await window.api.classify(payload);
      displayResult(data.classification);
      await loadStatistics();
      showNotification('Klasifikasi berhasil!', 'success');
    } catch (error) {
      console.error(error);
      showNotification(error?.error || 'Gagal mengklasifikasi', 'error');
    } finally {
      hideLoading();
    }
  }

  async function handleCsvUpload() {
    const input = document.getElementById('csvFile');
    if (!input || !input.files || input.files.length === 0) {
      showNotification('Pilih file CSV atau XLSX terlebih dahulu', 'error');
      return;
    }

    try {
      showLoading();
      const file = input.files[0];
      const text = await readBatchFileAsCsv(file);
      const rows = extractBatchRows(text);
      if (!rows.length) {
        throw { error: 'Tidak ada baris data valid untuk diproses' };
      }
      const data = await window.api.classifyBatch(rows);
      const countNode = document.getElementById('csvResultCount');
      if (countNode) {
        countNode.textContent = `Berhasil memproses ${data.count} baris dari file ${file.name}`;
      }
      displayCsvResults(data.results || []);
      await loadStatistics();
      showNotification('File berhasil diproses', 'success');
    } catch (error) {
      console.error(error);
      showNotification(error?.error || 'Gagal memproses file batch', 'error');
    } finally {
      hideLoading();
    }
  }

  async function readBatchFileAsCsv(file) {
    const name = String(file.name || '').toLowerCase();
    if (name.endsWith('.csv')) {
      return file.text();
    }

    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (!window.XLSX) {
        throw { error: 'Library XLSX belum termuat. Coba refresh halaman.' };
      }

      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw { error: 'Sheet XLSX tidak ditemukan' };
      }

      const sheet = workbook.Sheets[firstSheetName];
      return window.XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    }

    throw { error: 'Format file belum didukung. Gunakan .csv atau .xlsx' };
  }

  function extractBatchRows(csvText) {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      throw { error: 'File kosong atau tidak memiliki data' };
    }

    const header = parseCsvRow(lines[0].replace(/^\uFEFF/, ''));
    const normalizedHeader = header.map(normalizeHeaderName);
    const findIndex = (aliases) => {
      for (const alias of aliases) {
        const idx = normalizedHeader.indexOf(normalizeHeaderName(alias));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxStatus = findIndex(['status_hi', 'status hi', 'status']);
    const idxTtic = findIndex(['ttic']);
    const idxTtd = findIndex(['ttd_kb_num', 'ttd kb', 'ttd kb hari', 'ttd']);
    const idxSto = findIndex(['sto']);

    const out = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i]);
      const status = idxStatus !== -1 ? (cols[idxStatus] || '') : '';
      const ttic = idxTtic !== -1 ? (cols[idxTtic] || '') : '';
      const ttdRaw = idxTtd !== -1 ? (cols[idxTtd] || '') : '';
      const ttd = Number.parseInt(String(ttdRaw).replace(/[^0-9-]/g, ''), 10);
      const sto = idxSto !== -1 ? (cols[idxSto] || '') : '';

      out.push({
        status_hi: status,
        ttic,
        ttd_kb_num: Number.isFinite(ttd) ? ttd : 0,
        sto
      });
    }

    return out;
  }

  function normalizeHeaderName(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function parseCsvRow(line) {
    const out = [];
    const text = String(line || '');
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
        continue;
      }

      current += ch;
    }

    out.push(current.trim());
    return out;
  }

  function displayCsvResults(results) {
    const resultCard = document.getElementById('resultCard');
    const emptyState = document.getElementById('emptyState');
    const cardBody = document.querySelector('#resultCard .card-body');
    if (!resultCard || !cardBody || !results || results.length === 0) return;

    resultCard.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    let html = '<div id="csvPreview" class="mb-3"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="result-label mb-0">Hasil Klasifikasi Massal (preview)</h6><small class="text-muted">Menampilkan 5 baris pertama</small></div><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>No</th><th>Status HI</th><th>TTIC</th><th>TTD KB</th><th>STO</th><th>Prioritas</th><th>Confidence</th><th>Status</th></tr></thead><tbody>';
    results.slice(0, 5).forEach((row, index) => {
      const prioritas = row.output?.prioritas || '-';
      const confidence = Math.round((row.output?.confidence || 0) * 100);
      const statusHi = escapeHtml(row.input?.status_hi || '-');
      const ttic = escapeHtml(row.input?.ttic || '-');
      const ttd = escapeHtml(String(row.input?.ttd_kb_num ?? '-'));
      const sto = escapeHtml(row.input?.sto || '-');
      const rowStatus = row.error ? `<span class="text-danger">Gagal: ${escapeHtml(row.error)}</span>` : '<span class="text-success">OK</span>';
      html += `<tr><td>${index + 1}</td><td>${statusHi}</td><td>${ttic}</td><td>${ttd}</td><td>${sto}</td><td>${escapeHtml(prioritas)}</td><td>${confidence}%</td><td>${rowStatus}</td></tr>`;
    });
    html += '</tbody></table></div></div>';

    const old = document.getElementById('csvPreview');
    if (old) old.remove();

    const wrapper = htmlToElement(html);
    const marker = cardBody.querySelector('.result-timestamp') || cardBody.firstChild;
    cardBody.insertBefore(wrapper, marker);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayResult(classification) {
    const resultCard = document.getElementById('resultCard');
    const emptyState = document.getElementById('emptyState');
    if (resultCard) resultCard.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    const priorEl = document.getElementById('resultPrioritas');
    if (priorEl) {
      priorEl.textContent = classification.prioritas || '-';
      priorEl.className = `result-value text-${getPriorityClass(classification.prioritas)}`;
    }

    const confidence = classification.confidence || 0;
    const confidencePercent = Math.round(confidence * 100);
    const bar = document.getElementById('resultConfidenceBar');
    if (bar) {
      bar.style.width = `${confidencePercent}%`;
      bar.className = `progress-bar ${getConfidenceClass(confidence)}`;
    }

    const text = document.getElementById('resultConfidenceText');
    if (text) text.textContent = `${confidencePercent}% (${confidence.toFixed(2)})`;

    const reasoning = document.getElementById('resultReasoning');
    if (reasoning) reasoning.textContent = classification.reasoning || '-';

    const timestamp = document.getElementById('resultTimestamp');
    if (timestamp) timestamp.textContent = new Date().toLocaleString('id-ID');
  }

  function getPriorityClass(value) {
    switch (value) {
      case 'Tinggi': return 'danger';
      case 'Sedang': return 'warning';
      case 'Rendah': return 'success';
      default: return 'secondary';
    }
  }

  function getConfidenceClass(value) {
    if (value >= 0.9) return 'bg-success';
    if (value >= 0.7) return 'bg-info';
    if (value >= 0.5) return 'bg-warning';
    return 'bg-danger';
  }

  async function loadStatistics() {
    try {
      const response = await window.api.getStatistics();
      const stats = response.statistics;
      if (!stats) return;

      updateText('stat-total', stats.total || 0);
      updateText('stat-high', stats.byPriority?.Tinggi || 0);
      updateText('stat-medium', stats.byPriority?.Sedang || 0);
      updateText('stat-low', stats.byPriority?.Rendah || 0);
      updateText('stat-confidence', `${Math.round((stats.avgConfidence || 0) * 100)}%`);

      updatePriorityChart(stats.byPriority || {});
      updateConfidenceChart(stats.avgConfidence || 0);
    } catch (error) {
      console.error('loadStatistics', error);
    }
  }

  function updateText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function updatePriorityChart(byPriority) {
    const ctx = document.getElementById('chartPriority');
    if (!ctx || !window.Chart) return;

    if (chartPriority) chartPriority.destroy();

    chartPriority = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Tinggi', 'Sedang', 'Rendah'],
        datasets: [{
          data: [byPriority.Tinggi || 0, byPriority.Sedang || 0, byPriority.Rendah || 0],
          backgroundColor: ['rgba(220,53,69,0.75)', 'rgba(255,193,7,0.75)', 'rgba(40,167,69,0.75)'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function updateConfidenceChart(avgConfidence) {
    const ctx = document.getElementById('chartConfidence');
    if (!ctx || !window.Chart) return;

    if (chartConfidence) chartConfidence.destroy();

    const percentage = Math.round(avgConfidence * 100);
    chartConfidence = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Rata-rata Confidence'],
        datasets: [{
          label: 'Confidence (%)',
          data: [percentage],
          backgroundColor: [percentage >= 90 ? 'rgba(40,167,69,0.75)' : percentage >= 70 ? 'rgba(0,123,255,0.75)' : 'rgba(220,53,69,0.75)']
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, max: 100 } }
      }
    });
  }

  async function loadHistory() {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    try {
      const priority = document.getElementById('filterPriority')?.value || '';
      const response = priority ? await window.api.getHistoryByPriority(priority) : await window.api.getHistory(100);
      const records = response.data || [];

      if (!records.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Tidak ada data riwayat</td></tr>';
        return;
      }

      tableBody.innerHTML = records.map((record, index) => {
        const confidence = Math.round((record.output?.confidence || 0) * 100);
        const priorityClass = String(record.output?.prioritas || '').toLowerCase();
        return `<tr>
          <td>${index + 1}</td>
          <td>${new Date(record.timestamp).toLocaleString('id-ID')}</td>
          <td>${record.input?.status_hi || '-'}</td>
          <td>${record.input?.ttic || '-'}</td>
          <td>${record.input?.ttd_kb_num ?? '-'}</td>
          <td><span class="badge-priority ${priorityClass}">${record.output?.prioritas || '-'}</span></td>
          <td><span class="badge-confidence">${confidence}%</span></td>
          <td><button class="btn btn-sm btn-delete" onclick="window.UI_deleteRecord('${record.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      }).join('');
    } catch (error) {
      console.error('loadHistory', error);
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger py-4">Gagal memuat history</td></tr>';
    }
  }

  window.UI_deleteRecord = async function (id) {
    if (!confirm('Apakah Anda yakin ingin menghapus record ini?')) return;

    try {
      showLoading();
      await window.api.deleteRecord(id);
      showNotification('Record berhasil dihapus', 'success');
      await loadHistory();
      await loadStatistics();
    } catch (error) {
      console.error(error);
      showNotification('Gagal menghapus record', 'error');
    } finally {
      hideLoading();
    }
  };

  async function loadEvaluation() {
    const statusNode = document.getElementById('evalStatus');
    try {
      const response = await window.api.getEvaluation();
      const evaluation = response.evaluation || {};
      const comparison = evaluation.comparison || {};
      const tuning = evaluation.tuning || {};

      if (statusNode) {
        statusNode.textContent = response.refreshed ? 'Data evaluasi baru di-refresh dari model terbaru.' : 'Data evaluasi tersedia.';
      }

      updateText('evalAccuracy', tuning.best_score_f1_macro ? `${Math.round(tuning.best_score_f1_macro * 100)}%` : '-');
      updateText('evalCv', comparison.depth_3?.cv_scores ? comparison.depth_3.cv_scores.map(score => `${Math.round(score * 100)}%`).join(', ') : '-');
      updateText('evalParams', tuning.best_params ? Object.entries(tuning.best_params).map(([key, value]) => `${key}=${value}`).join(', ') : '-');
      updateText('evalSamples', tuning.n_samples || 0);

      const ctxDepth = document.getElementById('chartDepthCompare');
      if (ctxDepth && window.Chart) {
        if (chartDepthCompare) chartDepthCompare.destroy();
        const depth1 = Math.round((comparison.depth_1?.accuracy_mean || 0) * 100);
        const depth3 = Math.round((comparison.depth_3?.accuracy_mean || 0) * 100);
        chartDepthCompare = new Chart(ctxDepth, {
          type: 'bar',
          data: {
            labels: ['Depth 1', 'Depth 3'],
            datasets: [{
              label: 'Accuracy (%)',
              data: [depth1, depth3],
              backgroundColor: ['rgba(0,123,255,0.75)', 'rgba(40,167,69,0.75)']
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        });
      }

      const ctxFi = document.getElementById('chartFeatureImportance');
      if (ctxFi && window.Chart) {
        if (chartFeatureImportance) chartFeatureImportance.destroy();
        const fi = evaluation.feature_importances || [];
        const fn = evaluation.feature_names || ['status_enc', 'ttic_enc', 'ttd', 'sto_enc'];
        chartFeatureImportance = new Chart(ctxFi, {
          type: 'bar',
          data: {
            labels: fn,
            datasets: [{
              label: 'Importance (%)',
              data: fi.map(value => Math.round(value * 100)),
              backgroundColor: 'rgba(220,53,69,0.75)'
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        });
      }
    } catch (error) {
      console.error('loadEvaluation', error);
      if (statusNode) {
        statusNode.textContent = 'Evaluasi belum tersedia. Tambah data lalu tunggu model auto-refresh.';
      }
      updateText('evalAccuracy', '-');
      updateText('evalCv', '-');
      updateText('evalParams', '-');
      updateText('evalSamples', '-');
    }
  }

  function renderProfileCard() {
    const username = window.Layout?.getUsername ? window.Layout.getUsername() : (localStorage.getItem('auth_username') || 'Admin');
    updateText('profileName', username);
    updateText('profileRole', 'Operator');
    updateText('profileInitials', window.Layout?.getInitials ? window.Layout.getInitials(username) : 'A');

    const token = localStorage.getItem('auth_token') || '-';
    updateText('profileToken', token === '-' ? '-' : `${token.slice(0, 6)}••••${token.slice(-4)}`);
    updateText('profileLoginTime', new Date().toLocaleString('id-ID'));
  }

  function downloadBinary(path, filename) {
    (async () => {
      try {
        showLoading();
        const token = localStorage.getItem('auth_token');
        const response = await fetch(window.location.origin + path, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error('Download gagal');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        showNotification('Export berhasil', 'success');
      } catch (error) {
        console.error(error);
        showNotification('Gagal export', 'error');
      } finally {
        hideLoading();
      }
    })();
  }

  function showLoading() {
    const node = document.getElementById('loadingOverlay');
    if (node) node.style.display = 'flex';
  }

  function hideLoading() {
    const node = document.getElementById('loadingOverlay');
    if (node) node.style.display = 'none';
  }

  function showNotification(message, type = 'info') {
    const alertClass = type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info';
    const node = document.createElement('div');
    node.className = `alert ${alertClass} alert-dismissible fade show`;
    node.setAttribute('role', 'alert');
    node.style.position = 'fixed';
    node.style.top = '84px';
    node.style.right = '20px';
    node.style.zIndex = '9999';
    node.style.minWidth = '300px';
    node.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  function updateText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function htmlToElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }
})();
