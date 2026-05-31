/**
 * Frontend Application - ML Classification Platform
 * BGES Telkom Pekanbaru
 */

const API_BASE = `${window.location.origin}/api`;

// Helper for authenticated API requests
function apiFetch(endpoint, opts = {}) {
    const token = localStorage.getItem('auth_token');
    opts = opts || {};
    opts.headers = opts.headers || {};

    // don't override content-type when sending FormData
    if (!(opts.body instanceof FormData) && !opts.headers['Content-Type']) {
        opts.headers['Content-Type'] = 'application/json';
    }

    if (token) {
        opts.headers['Authorization'] = 'Bearer ' + token;
    }

    return fetch(`${API_BASE}${endpoint}`, opts);
}

// Chart instances
let chartPriority = null;
let chartConfidence = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Application initialized');
    // Redirect to login if not authenticated
    if (!window.location.pathname.endsWith('login.html')) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }
    }

    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    loadStatistics();
    loadHistory();
    
    // Auto-refresh every 30 seconds
    setInterval(loadStatistics, 30000);
});

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Classifier form
    document.getElementById('classifierForm').addEventListener('submit', handleClassify);
    // CSV upload
    const csvBtn = document.getElementById('processCsvBtn');
    if (csvBtn) csvBtn.addEventListener('click', (e) => { e.preventDefault(); handleCsvUpload(); });
    
    // Export buttons (CSV / Excel / PDF)
    const csvBtn = document.getElementById('exportCsvBtn');
    const xlsxBtn = document.getElementById('exportXlsxBtn');
    const pdfBtn = document.getElementById('exportPdfBtn');
    if (csvBtn) csvBtn.addEventListener('click', (e) => { e.preventDefault(); handleExportCsv(); });
    if (xlsxBtn) xlsxBtn.addEventListener('click', (e) => { e.preventDefault(); handleExportXlsx(); });
    if (pdfBtn) pdfBtn.addEventListener('click', (e) => { e.preventDefault(); handleExportPdf(); });
    
    // Filter buttons
    document.getElementById('filterPriority').addEventListener('change', loadHistory);
    document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);
    
    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

/**
 * Handle CSV upload and classification
 */
async function handleCsvUpload() {
    const fileInput = document.getElementById('csvFile');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showNotification('Pilih file CSV terlebih dahulu', 'error');
        return;
    }

    const file = fileInput.files[0];

    try {
        showLoading();

        const text = await file.text();
        const resp = await apiFetch('/classify/csv-text', {
            method: 'POST',
            body: JSON.stringify({ csv: text })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
            document.getElementById('csvResultCount').textContent = `Berhasil memproses ${data.count} baris`;
            // Show first 5 results in resultCard area
            const results = data.results || [];
            displayCsvResults(results.slice(0,5));
            loadStatistics();
            loadHistory();
            showNotification('CSV diproses', 'success');
        } else {
            showNotification(data.error || 'Gagal memproses CSV', 'error');
        }
    } catch (e) {
        console.error(e);
        showNotification('Gagal mengupload CSV', 'error');
    } finally {
        hideLoading();
    }
}

function displayCsvResults(results) {
    if (!results || results.length === 0) return;
    const resultCard = document.getElementById('resultCard');
    const emptyState = document.getElementById('emptyState');
    resultCard.style.display = 'block';
    emptyState.style.display = 'none';

    // Build a simple table of results
    let html = '<div class="mb-3"><h6 class="result-label">Hasil CSV (preview)</h6><div class="table-responsive"><table class="table small"><thead><tr><th>No</th><th>Prioritas</th><th>Confidence</th><th>Input</th></tr></thead><tbody>';
    results.forEach((r, i) => {
        html += `<tr><td>${i+1}</td><td>${r.output.prioritas}</td><td>${Math.round(r.output.confidence*100)}%</td><td>${r.input.status_hi} | ${r.input.ttic} | ${r.input.ttd_kb_num} | ${r.input.sto}</td></tr>`;
    });
    html += '</tbody></table></div></div>';

    // append to result card body
    const cardBody = document.querySelector('#resultCard .card-body');
    const existing = document.getElementById('csvPreview');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'csvPreview';
    div.innerHTML = html;
    cardBody.insertBefore(div, cardBody.querySelector('.result-timestamp'));
}

// ==================== CLASSIFIER ====================

/**
 * Handle form submission untuk klasifikasi
 */
async function handleClassify(e) {
    e.preventDefault();
    
    try {
        showLoading();
        
        const formData = {
            status_hi: document.getElementById('status_hi').value,
            ttic: document.getElementById('ttic').value,
            ttd_kb_num: parseInt(document.getElementById('ttd_kb_num').value),
            sto: document.getElementById('sto').value
        };

        const response = await apiFetch('/classify', {
            method: 'POST',
            headers: {
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            displayResult(data.classification);
            
            // Reload statistics dan history
            loadStatistics();
            loadHistory();
            
            // Show success message
            showNotification('Klasifikasi berhasil!', 'success');
        } else {
            showNotification(data.error || 'Terjadi kesalahan', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal menghubungi server', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Display hasil klasifikasi
 */
function displayResult(classification) {
    const { prioritas, confidence, reasoning } = classification;
    
    // Show result card
    const resultCard = document.getElementById('resultCard');
    const emptyState = document.getElementById('emptyState');
    
    resultCard.style.display = 'block';
    emptyState.style.display = 'none';
    
    // Update values
    document.getElementById('resultPrioritas').textContent = prioritas;
    document.getElementById('resultPrioritas').className = `result-value text-${getPriorityClass(prioritas)}`;
    
    const confidencePercent = Math.round(confidence * 100);
    document.getElementById('resultConfidenceBar').style.width = confidencePercent + '%';
    document.getElementById('resultConfidenceBar').className = `progress-bar ${getConfidenceClass(confidence)}`;
    document.getElementById('resultConfidenceText').textContent = `${confidencePercent}% (${confidence.toFixed(2)})`;
    
    document.getElementById('resultReasoning').textContent = reasoning;
    document.getElementById('resultTimestamp').textContent = new Date().toLocaleString('id-ID');
    
    // Scroll ke result
    setTimeout(() => {
        document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
    }, 300);
}

/**
 * Get priority CSS class
 */
function getPriorityClass(prioritas) {
    switch(prioritas) {
        case 'Tinggi': return 'danger';
        case 'Sedang': return 'warning';
        case 'Rendah': return 'success';
        default: return 'secondary';
    }
}

/**
 * Get confidence CSS class
 */
function getConfidenceClass(confidence) {
    if (confidence >= 0.9) return 'bg-success';
    if (confidence >= 0.7) return 'bg-info';
    if (confidence >= 0.5) return 'bg-warning';
    return 'bg-danger';
}

// ==================== STATISTICS & CHARTS ====================

/**
 * Load statistics dari API
 */
async function loadStatistics() {
    try {
        const response = await apiFetch('/statistics');
        const data = await response.json();

        if (data.success) {
            const stats = data.statistics;

            // Update stat cards
            document.getElementById('stat-total').textContent = stats.total;
            document.getElementById('stat-high').textContent = stats.byPriority.Tinggi;
            document.getElementById('stat-medium').textContent = stats.byPriority.Sedang;
            document.getElementById('stat-low').textContent = stats.byPriority.Rendah;

            // Update charts
            updateCharts(stats);

                // also load evaluation info
                loadEvaluation();
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

/**
 * Update charts dengan data terbaru
 */
function updateCharts(stats) {
    updatePriorityChart(stats.byPriority);
    updateConfidenceChart(stats.avgConfidence);
}

/**
 * Update priority distribution chart
 */
function updatePriorityChart(byPriority) {
    const ctx = document.getElementById('chartPriority');
    if (!ctx) return;

    const data = {
        labels: ['Tinggi', 'Sedang', 'Rendah'],
        datasets: [{
            data: [
                byPriority.Tinggi,
                byPriority.Sedang,
                byPriority.Rendah
            ],
            backgroundColor: [
                'rgba(220, 53, 69, 0.7)',
                'rgba(255, 193, 7, 0.7)',
                'rgba(40, 167, 69, 0.7)'
            ],
            borderColor: [
                'rgb(220, 53, 69)',
                'rgb(255, 193, 7)',
                'rgb(40, 167, 69)'
            ],
            borderWidth: 2
        }]
    };

    // Properly destroy existing chart before creating new one
    if (chartPriority) {
        chartPriority.destroy();
        chartPriority = null;
    }

    try {
        chartPriority = new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating priority chart:', error);
    }
}

/**
 * Update confidence score chart
 */
function updateConfidenceChart(avgConfidence) {
    const ctx = document.getElementById('chartConfidence');
    if (!ctx) return;

    const confidencePercent = Math.round(avgConfidence * 100);

    // Properly destroy existing chart before creating new one
    if (chartConfidence) {
        chartConfidence.destroy();
        chartConfidence = null;
    }

    try {
        // Using Bar chart instead of gauge for better compatibility
        chartConfidence = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Average Confidence'],
                datasets: [{
                    label: 'Confidence Score (%)',
                    data: [confidencePercent],
                    backgroundColor: [
                        confidencePercent >= 90 ? 'rgba(40, 167, 69, 0.7)' :
                        confidencePercent >= 70 ? 'rgba(0, 123, 255, 0.7)' :
                        confidencePercent >= 50 ? 'rgba(255, 193, 7, 0.7)' :
                        'rgba(220, 53, 69, 0.7)'
                    ],
                    borderColor: [
                        confidencePercent >= 90 ? 'rgb(40, 167, 69)' :
                        confidencePercent >= 70 ? 'rgb(0, 123, 255)' :
                        confidencePercent >= 50 ? 'rgb(255, 193, 7)' :
                        'rgb(220, 53, 69)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating confidence chart:', error);
    }
}

// ==================== HISTORY ====================

/**
 * Load history dari API
 */
async function loadHistory() {
    try {
        const priority = document.getElementById('filterPriority').value;
        let endpoint = `/history?limit=100`;

        if (priority) {
            endpoint = `/history/priority/${priority}`;
        }

        const response = await apiFetch(endpoint);
        const data = await response.json();

        if (data.success) {
            displayHistory(data.data);
        }
    } catch (error) {
        console.error('Error loading history:', error);
        displayHistoryEmpty();
    }
}

/**
 * Display history dalam tabel
 */
function displayHistory(records) {
    const tbody = document.getElementById('historyTableBody');
    
    if (!records || records.length === 0) {
        displayHistoryEmpty();
        return;
    }

    let html = '';
    records.forEach((record, index) => {
        const timestamp = new Date(record.timestamp).toLocaleString('id-ID');
        const prioritasClass = `badge-priority ${record.output.prioritas.toLowerCase()}`;
        const confidencePercent = Math.round(record.output.confidence * 100);

        html += `
            <tr class="fade-in">
                <td>${index + 1}</td>
                <td><small>${timestamp}</small></td>
                <td>${record.input.status_hi || '-'}</td>
                <td>${record.input.ttic || '-'}</td>
                <td>${record.input.ttd_kb_num || '-'}</td>
                <td>
                    <span class="${prioritasClass}">
                        ${record.output.prioritas}
                    </span>
                </td>
                <td>
                    <span class="badge-confidence">${confidencePercent}%</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-delete" onclick="deleteRecord('${record.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

/**
 * Display empty state history
 */
function displayHistoryEmpty() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center text-muted py-4">
                <i class="fas fa-inbox"></i> Tidak ada data riwayat
            </td>
        </tr>
    `;
}

/**
 * Delete record dari history
 */
async function deleteRecord(recordId) {
    if (!confirm('Apakah Anda yakin ingin menghapus record ini?')) {
        return;
    }

    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/history/${recordId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('Record berhasil dihapus', 'success');
            loadHistory();
            loadStatistics();
        } else {
            showNotification('Gagal menghapus record', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal menghubungi server', 'error');
    } finally {
        hideLoading();
    }
}

// ==================== EXPORT ====================

/**
 * Handle export ke CSV
 */
async function handleExportCsv() {
    try {
        showLoading();

        const response = await apiFetch('/export/csv');

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kendala_history_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showNotification('Export CSV berhasil!', 'success');
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Gagal export CSV', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal menghubungi server', 'error');
    } finally {
        hideLoading();
    }
}

async function handleExportXlsx() {
    try {
        showLoading();

        const response = await apiFetch('/export/xlsx');

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kendala_history_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showNotification('Export Excel berhasil!', 'success');
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Gagal export Excel', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal menghubungi server', 'error');
    } finally {
        hideLoading();
    }
}

async function handleExportPdf() {
    try {
        showLoading();

        const response = await apiFetch('/export/pdf');

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kendala_history_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showNotification('Export PDF berhasil!', 'success');
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Gagal export PDF', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Gagal menghubungi server', 'error');
    } finally {
        hideLoading();
    }
}

// ==================== UTILITIES ====================

/**
 * Show loading overlay
 */
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const alertClass = type === 'error' ? 'alert-danger' : 
                      type === 'success' ? 'alert-success' : 'alert-info';
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass} alert-dismissible fade show`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '80px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.minWidth = '300px';
    
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

/**
 * Format date ke format Indonesia
 */
function formatDate(date) {
    return new Date(date).toLocaleString('id-ID');
}

console.log('✅ All functions loaded successfully');

// ==================== MODEL EVALUATION ====================

let chartFeatureImportance = null;
let chartDepthCompare = null;

async function loadEvaluation() {
    try {
        const response = await apiFetch('/evaluation');
        const data = await response.json();
        if (!data.success) return;

        const evalData = data.evaluation || {};
        // If comparison exists, display accuracy for depth=3
        const comparison = evalData.comparison || {};
        if (comparison.depth_3) {
            const acc = Math.round((comparison.depth_3.accuracy_mean || 0) * 100);
            document.getElementById('evalAccuracy').textContent = acc + '%';
            document.getElementById('evalCv').textContent = (comparison.depth_3.cv_scores || []).map(s => Math.round(s*100)+'%').join(', ');
            document.getElementById('evalParams').textContent = (evalData.model_params && evalData.model_params.max_depth) ? `max_depth=${evalData.model_params.max_depth}` : '';

            // Depth compare chart
            const ctxD = document.getElementById('chartDepthCompare');
            if (ctxD) {
                if (chartDepthCompare) { chartDepthCompare.destroy(); chartDepthCompare = null; }
                const labels = ['Depth 1','Depth 3'];
                const values = [Math.round((comparison.depth_1.accuracy_mean||0)*100), Math.round((comparison.depth_3.accuracy_mean||0)*100)];
                chartDepthCompare = new Chart(ctxD, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Accuracy (%)', data: values, backgroundColor: ['rgba(0,123,255,0.7)','rgba(40,167,69,0.7)'] }] },
                    options: { responsive:true, maintainAspectRatio:true, scales:{ y:{ beginAtZero:true, max:100 } } }
                });
            }
        }

        // Feature importances
        const fi = evalData.feature_importances || evalData.feature_importances || [];
        const fn = evalData.feature_names || ['status_enc','ttic_enc','ttd','sto_enc'];

        const ctx = document.getElementById('chartFeatureImportance');
        if (ctx) {
            if (chartFeatureImportance) { chartFeatureImportance.destroy(); chartFeatureImportance = null; }
            chartFeatureImportance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: fn,
                    datasets: [{ label: 'Importance', data: fi.map(v => Math.round(v*100)), backgroundColor: 'rgba(220,53,69,0.7)' }]
                },
                options: { responsive:true, maintainAspectRatio:true, scales:{ y:{ beginAtZero:true, max:100, ticks:{ callback: v => v + '%' } } } }
            });
        }

    } catch (error) {
        console.error('Error loading evaluation:', error);
    }
}
