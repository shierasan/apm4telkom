/**
 * Frontend Application - ML Classification Platform
 * BGES Telkom Pekanbaru
 */

const API_BASE = 'http://localhost:3000/api';

// Chart instances
let chartPriority = null;
let chartConfidence = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Application initialized');
    
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
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', handleExport);
    
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

        const response = await fetch(`${API_BASE}/classify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
        const response = await fetch(`${API_BASE}/statistics`);
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
        let url = `${API_BASE}/history?limit=100`;

        if (priority) {
            url = `${API_BASE}/history/priority/${priority}`;
        }

        const response = await fetch(url);
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
async function handleExport() {
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE}/export/csv`);
        
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
            
            showNotification('Export berhasil!', 'success');
        } else {
            showNotification('Gagal export data', 'error');
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
