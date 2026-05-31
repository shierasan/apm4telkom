(function () {
  let chartPriority = null;
  let chartConfidence = null;
  let chartFeatureImportance = null;
  let chartDepthCompare = null;
  let selectedHistoryIds = new Set();
  let historyPage = 1;
  let historyLimit = 25;
  let historyTotalPages = 1;

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
    if (filter) filter.addEventListener('change', () => loadHistory(1));

    const refreshBtn = document.getElementById('refreshHistoryBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadHistory(historyPage));

    const prevBtn = document.getElementById('historyPrevBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => loadHistory(Math.max(1, historyPage - 1)));

    const nextBtn = document.getElementById('historyNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', () => loadHistory(Math.min(historyTotalPages, historyPage + 1)));

    const selectAllBtn = document.getElementById('selectAllHistoryBtn');
    if (selectAllBtn) selectAllBtn.addEventListener('click', toggleSelectAllHistory);

    const deleteSelectedBtn = document.getElementById('deleteSelectedHistoryBtn');
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedHistoryRecords);

    const selectAllCheckbox = document.getElementById('selectAllHistoryCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (event) => {
        const checked = event.target.checked;
        document.querySelectorAll('.history-row-select').forEach((checkbox) => {
          checkbox.checked = checked;
          updateSelectedHistoryIds(checkbox.dataset.id, checked);
        });
        syncSelectAllCheckbox();
      });
    }

    const exportCsv = document.getElementById('exportCsvBtn');
    if (exportCsv) exportCsv.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/csv', 'laporan_riwayat_klasifikasi.csv');
    });

    const exportXlsx = document.getElementById('exportXlsxBtn');
    if (exportXlsx) exportXlsx.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/xlsx', 'laporan_riwayat_klasifikasi.xlsx');
    });

    const exportPdf = document.getElementById('exportPdfBtn');
    if (exportPdf) exportPdf.addEventListener('click', (event) => {
      event.preventDefault();
      downloadBinary('/api/export/pdf', 'laporan_riwayat_klasifikasi.pdf');
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
      console.debug('[batch] handleCsvUpload: parsed rows count=', rows.length);
      if (rows && rows.length) console.debug('[batch] handleCsvUpload sample row=', rows[0]);
      // Temporary on-page debug: show parsed count and first row so users without console can verify
      const previewNode = document.getElementById('csvResultCount');
      if (previewNode) {
        try {
          const sample = rows && rows.length ? JSON.stringify(rows[0]) : '-';
          previewNode.textContent = `Parsed ${rows.length} rows. Sample: ${sample}`;
        } catch (e) {
          previewNode.textContent = `Parsed ${rows.length} rows.`;
        }
      }
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
      const txt = await file.text();
      console.debug('[batch] readBatchFileAsCsv: csv length=', txt.length, 'file=', file.name);
      return txt;
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
      const csv = window.XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      console.debug('[batch] readBatchFileAsCsv: xlsx -> csv length=', csv.length, 'file=', file.name);
      return csv;
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

    const expectedFields = ['status_hi', 'ttic', 'ttd_kb_num', 'sto'];
    const headerAliases = {
      status_hi: ['status_hi', 'status hi', 'status', 'statushi'],
      ttic: ['ttic'],
      ttd_kb_num: ['ttd_kb_num', 'ttd kb num', 'ttd kb', 'ttd kb hari', 'ttd', 'ttd hari'],
      sto: ['sto']
    };

    const detectCsvDelimiter = (sampleLines) => {
      const candidates = [',', ';', '\t'];
      let bestDelimiter = ',';
      let bestScore = -1;
      let bestHeaderIndex = 0;

      for (const delimiter of candidates) {
        for (let i = 0; i < sampleLines.length; i++) {
          const parsed = parseCsvRow(sampleLines[i].replace(/^\uFEFF/, ''), delimiter);
          const normalized = parsed.map(normalizeHeaderName);
          const score = expectedFields.reduce((total, field) => {
            const aliases = headerAliases[field] || [];
            const hit = aliases.some((alias) => normalized.includes(normalizeHeaderName(alias)));
            return total + (hit ? 1 : 0);
          }, 0) + (parsed.length > 1 ? 0.25 : 0);

          if (score > bestScore) {
            bestScore = score;
            bestDelimiter = delimiter;
            bestHeaderIndex = i;
          }
        }
      }

      return { delimiter: bestDelimiter, headerIndex: bestHeaderIndex };
    };

    const sampleLines = lines.slice(0, Math.min(lines.length, 20));
    const detected = detectCsvDelimiter(sampleLines);
    const delimiter = detected.delimiter;

    let headerIndex = detected.headerIndex;
    let header = parseCsvRow(lines[headerIndex].replace(/^\uFEFF/, ''), delimiter);
    let normalizedHeader = header.map(normalizeHeaderName);
    let idxStatus = findHeaderIndexFromNormalized(normalizedHeader, headerAliases.status_hi);
    let idxTtic = findHeaderIndexFromNormalized(normalizedHeader, headerAliases.ttic);
    let idxTtd = findHeaderIndexFromNormalized(normalizedHeader, headerAliases.ttd_kb_num);
    let idxSto = findHeaderIndexFromNormalized(normalizedHeader, headerAliases.sto);

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const candidate = parseCsvRow(lines[i].replace(/^\uFEFF/, ''), delimiter);
      const candidateNormalized = candidate.map(normalizeHeaderName);
      const candidateStatus = findHeaderIndexFromNormalized(candidateNormalized, headerAliases.status_hi);
      const candidateTtic = findHeaderIndexFromNormalized(candidateNormalized, headerAliases.ttic);
      const candidateTtd = findHeaderIndexFromNormalized(candidateNormalized, headerAliases.ttd_kb_num);
      const candidateSto = findHeaderIndexFromNormalized(candidateNormalized, headerAliases.sto);
      const foundCount = [candidateStatus, candidateTtic, candidateTtd, candidateSto].filter((value) => value !== -1).length;
      if (foundCount >= 3) {
        headerIndex = i;
        header = candidate;
        normalizedHeader = candidateNormalized;
        idxStatus = candidateStatus;
        idxTtic = candidateTtic;
        idxTtd = candidateTtd;
        idxSto = candidateSto;
        break;
      }
    }

    console.debug('[batch] extractBatchRows: delimiter=', delimiter, 'headerIndex=', headerIndex, 'header=', header);

    const out = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i], delimiter);
      const status = normalizeBatchStatus(idxStatus !== -1 ? (cols[idxStatus] || '') : '');
      const ttic = normalizeBatchTtic(idxTtic !== -1 ? (cols[idxTtic] || '') : '');
      const ttdRaw = idxTtd !== -1 ? (cols[idxTtd] || '') : '';
      const ttd = Number.parseInt(String(ttdRaw).replace(/[^0-9-]/g, ''), 10);
      const sto = normalizeBatchText(idxSto !== -1 ? (cols[idxSto] || '') : '');

      if (!status && !ttic && !sto && !Number.isFinite(ttd)) {
        continue;
      }

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

  function findHeaderIndexFromNormalized(normalizedHeader, aliases) {
    for (const alias of aliases) {
      const idx = normalizedHeader.indexOf(normalizeHeaderName(alias));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function parseCsvRow(line, delimiter = ',') {
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

      if (ch === delimiter && !inQuotes) {
        out.push(current.trim());
        current = '';
        continue;
      }

      current += ch;
    }

    out.push(current.trim());
    return out;
  }

  function normalizeBatchText(value) {
    return String(value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeBatchStatus(value) {
    const text = normalizeBatchText(value).toLowerCase();
    if (!text) return '';
    if (text.includes('progress') || text === 'open') return 'In Progress';
    if (text.includes('reject')) return 'Rejected';
    if (text.includes('close')) return 'Closed';
    if (text.includes('in progress')) return 'In Progress';
    return normalizeBatchText(value);
  }

  function normalizeBatchTtic(value) {
    const text = normalizeBatchText(value).toLowerCase();
    if (!text) return '';
    if (text.includes('1x24')) return '1x24 jam';
    if (text.includes('2x24')) return '2x24 jam';
    if (text.includes('3x24') || text.includes('>3x24') || text.includes('lebih dari 3x24')) return '>3x24 jam';
    return normalizeBatchText(value);
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

  async function loadHistory(page = historyPage) {
    const tableBody = document.getElementById('historyTableBody');
    if (!tableBody) return;

    try {
      historyPage = Math.max(1, parseInt(page, 10) || 1);
      const priority = document.getElementById('filterPriority')?.value || '';
      const response = await window.api.getHistoryPage({ page: historyPage, limit: historyLimit, priority });
      const records = response.data || [];
      historyPage = response.page || historyPage;
      historyLimit = response.limit || historyLimit;
      historyTotalPages = response.totalPages || 1;
      const visibleIds = new Set(records.map(record => record.id));
      selectedHistoryIds = new Set([...selectedHistoryIds].filter(id => visibleIds.has(id)));
      const rowStartNumber = ((historyPage - 1) * historyLimit) + 1;

      if (!records.length) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Tidak ada data riwayat</td></tr>';
        syncSelectAllCheckbox();
        updateHistoryPageInfo(response.total || 0, historyPage, historyTotalPages, historyLimit);
        updateHistoryPagerState();
        return;
      }

      tableBody.innerHTML = records.map((record, index) => {
        const confidence = Math.round((record.output?.confidence || 0) * 100);
        const priorityClass = String(record.output?.prioritas || '').toLowerCase();
        const checked = selectedHistoryIds.has(record.id) ? 'checked' : '';
        return `<tr>
          <td><input type="checkbox" class="form-check-input history-row-select" data-id="${record.id}" ${checked}></td>
          <td>${rowStartNumber + index}</td>
          <td>${new Date(record.timestamp).toLocaleString('id-ID')}</td>
          <td>${record.input?.status_hi || '-'}</td>
          <td>${record.input?.ttic || '-'}</td>
          <td>${record.input?.ttd_kb_num ?? '-'}</td>
          <td><span class="badge-priority ${priorityClass}">${record.output?.prioritas || '-'}</span></td>
          <td><span class="badge-confidence">${confidence}%</span></td>
          <td><button class="btn btn-sm btn-delete" onclick="window.UI_deleteRecord('${record.id}')"><i class="fas fa-trash"></i></button></td>
        </tr>`;
      }).join('');

      tableBody.querySelectorAll('.history-row-select').forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
          updateSelectedHistoryIds(event.target.dataset.id, event.target.checked);
          syncSelectAllCheckbox();
        });
      });

      syncSelectAllCheckbox();
      updateHistoryPageInfo(response.total || records.length, historyPage, historyTotalPages, historyLimit);
      updateHistoryPagerState();
    } catch (error) {
      console.error('loadHistory', error);
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Gagal memuat history</td></tr>';
      updateHistoryPageInfo(0, historyPage, historyTotalPages, historyLimit);
      updateHistoryPagerState();
    }
  }

  function updateHistoryPageInfo(total, page, totalPages, limit) {
    const node = document.getElementById('historyPageInfo');
    if (!node) return;
    if (!total) {
      node.textContent = 'Tidak ada data riwayat';
      return;
    }
    const start = ((page - 1) * limit) + 1;
    const end = Math.min(page * limit, total);
    node.textContent = `Menampilkan ${start}-${end} dari ${total} data | Halaman ${page} dari ${totalPages}`;
  }

  function updateHistoryPagerState() {
    const prevBtn = document.getElementById('historyPrevBtn');
    const nextBtn = document.getElementById('historyNextBtn');
    if (prevBtn) prevBtn.disabled = historyPage <= 1;
    if (nextBtn) nextBtn.disabled = historyPage >= historyTotalPages;
  }

  function updateSelectedHistoryIds(id, checked) {
    if (!id) return;
    if (checked) {
      selectedHistoryIds.add(id);
    } else {
      selectedHistoryIds.delete(id);
    }
  }

  function syncSelectAllCheckbox() {
    const checkbox = document.getElementById('selectAllHistoryCheckbox');
    const visibleChecks = Array.from(document.querySelectorAll('.history-row-select'));
    if (!checkbox) return;

    const checkedCount = visibleChecks.filter(node => node.checked).length;
    checkbox.checked = visibleChecks.length > 0 && checkedCount === visibleChecks.length;
    checkbox.indeterminate = checkedCount > 0 && checkedCount < visibleChecks.length;
  }

  function toggleSelectAllHistory() {
    const visibleChecks = Array.from(document.querySelectorAll('.history-row-select'));
    if (!visibleChecks.length) return;

    const shouldSelect = visibleChecks.some(node => !node.checked);
    visibleChecks.forEach((checkbox) => {
      checkbox.checked = shouldSelect;
      updateSelectedHistoryIds(checkbox.dataset.id, shouldSelect);
    });
    syncSelectAllCheckbox();
  }

  async function deleteSelectedHistoryRecords() {
    const ids = Array.from(selectedHistoryIds);
    if (!ids.length) {
      showNotification('Pilih minimal satu riwayat terlebih dahulu', 'error');
      return;
    }

    const message = ids.length === 1
      ? 'Apakah Anda yakin ingin menghapus 1 riwayat terpilih?'
      : `Apakah Anda yakin ingin menghapus ${ids.length} riwayat terpilih?`;

    if (!confirm(message)) return;

    try {
      showLoading();
      await window.api.deleteRecords(ids);
      selectedHistoryIds = new Set();
      showNotification('Riwayat terpilih berhasil dihapus', 'success');
      await loadHistory(Math.min(historyPage, Math.max(1, historyTotalPages)));
      await loadStatistics();
    } catch (error) {
      console.error(error);
      showNotification(error?.error || 'Gagal menghapus riwayat terpilih', 'error');
    } finally {
      hideLoading();
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

      const bestScore = typeof tuning.best_score_f1_macro === 'number' ? Math.round(tuning.best_score_f1_macro * 100) : null;
      const depth3Scores = Array.isArray(comparison.depth_3?.cv_scores) ? comparison.depth_3.cv_scores : [];
      const depth3Mean = depth3Scores.length ? Math.round(depth3Scores.reduce((total, score) => total + score, 0) / depth3Scores.length * 100) : null;
      const bestParams = tuning.best_params || {};
      const pickedParams = pickEvaluationParams(bestParams);
      const samples = Number(tuning.n_samples || 0);

      updateText('evalAccuracy', bestScore !== null ? `${bestScore}%` : '-');
      updateText('evalAccuracyNote', 'Skor F1 macro terbaik dari proses tuning dan training terakhir.');
      updateText('evalCv', depth3Mean !== null ? `${depth3Mean}%` : '-');
      updateText('evalCvNote', depth3Scores.length ? `Fold: ${depth3Scores.map(score => `${Math.round(score * 100)}%`).join(', ')}` : 'Tidak ada skor cross-validation tersimpan.');
      updateText('evalParams', pickedParams.summary || '-');
      updateText('evalParamsNote', pickedParams.detail || 'Parameter model pohon keputusan yang terpilih.');
      updateText('evalSamples', samples);
      updateText('evalSamplesNote', samples ? 'Jumlah data history yang dipakai saat training.' : 'Belum ada data history untuk training.');

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
      updateText('evalAccuracyNote', '-');
      updateText('evalCv', '-');
      updateText('evalCvNote', '-');
      updateText('evalParams', '-');
      updateText('evalParamsNote', '-');
      updateText('evalSamples', '-');
      updateText('evalSamplesNote', '-');
    }
  }

  function pickEvaluationParams(params) {
    const keys = ['max_depth', 'min_samples_leaf', 'class_weight', 'criterion'];
    const picked = keys
      .filter((key) => params && params[key] !== undefined && params[key] !== null)
      .map((key) => `${key}=${params[key]}`);

    return {
      summary: picked.length ? picked.join(' • ') : '',
      detail: picked.length ? 'Parameter tree terbaik yang dipakai saat model ini dilatih.' : ''
    };
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
