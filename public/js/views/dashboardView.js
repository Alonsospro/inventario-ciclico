// View: Dashboard & ERU Metrics
window.DashboardView = {
  chartAbc: null,
  chartCenters: null,

  init() {
    this.setupListeners();
  },

  setupListeners() {
    document.getElementById('dash-filter-type')?.addEventListener('change', () => this.loadDashboard());
    document.getElementById('dash-filter-center')?.addEventListener('change', () => this.loadDashboard());
  },

  async loadDashboard() {
    const type = document.getElementById('dash-filter-type')?.value || 'TODOS';
    const center = document.getElementById('dash-filter-center')?.value || 'TODOS';

    try {
      const [metricsRes, auditRes] = await Promise.all([
        window.API.getDashboardMetrics({ type, center }),
        window.API.getAuditLogs({ center, limit: 50 })
      ]);

      this.renderKPIs(metricsRes.summary);
      this.renderCharts(metricsRes);
      this.renderAuditLogs(auditRes.logs || []);
    } catch (err) {
      window.Toast.danger(err.message || 'Error cargando datos del Dashboard');
    }
  },

  renderKPIs(summary) {
    if (!summary) return;

    document.getElementById('stat-audited').textContent = summary.totalItemsAudited;
    document.getElementById('stat-planned').textContent = `De ${summary.totalItemsPlanned} planificados`;

    document.getElementById('stat-eru').textContent = `${summary.eruPercent.toFixed(1)}%`;
    document.getElementById('stat-accuracy').textContent = `${summary.globalAccuracyPercent.toFixed(1)}%`;
    document.getElementById('stat-exact-count').textContent = `${summary.totalExactItems} ítems exactos`;

    document.getElementById('stat-diff-cost').textContent = `$${summary.totalAbsoluteDiffCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-damaged-count').textContent = `${summary.totalDamagedItems} piezas en mal estado (Col P)`;
  },

  renderCharts(data) {
    const abc = data.abcBreakdown || {};
    const centerStats = data.centerStats || [];

    // 1. ABC Chart
    const ctxAbc = document.getElementById('chart-abc')?.getContext('2d');
    if (ctxAbc) {
      if (this.chartAbc) this.chartAbc.destroy();

      this.chartAbc = new Chart(ctxAbc, {
        type: 'bar',
        data: {
          labels: ['Categoría A', 'Categoría B', 'Categoría C'],
          datasets: [
            {
              label: 'Exactitud %',
              data: [
                parseFloat(abc.A?.accuracy || 100),
                parseFloat(abc.B?.accuracy || 100),
                parseFloat(abc.C?.accuracy || 100)
              ],
              backgroundColor: ['#10b981', '#38bdf8', '#f59e0b'],
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // 2. Centers Chart
    const ctxCenters = document.getElementById('chart-centers')?.getContext('2d');
    if (ctxCenters) {
      if (this.chartCenters) this.chartCenters.destroy();

      const labels = centerStats.map(c => c.center);
      const accData = centerStats.map(c => parseFloat(c.accuracy || 100));

      this.chartCenters = new Chart(ctxCenters, {
        type: 'bar',
        data: {
          labels: labels.length > 0 ? labels : ['Warnes', 'Central'],
          datasets: [
            {
              label: 'Exactitud %',
              data: accData.length > 0 ? accData : [100, 100],
              backgroundColor: '#38bdf8',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: {
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  },

  renderAuditLogs(logs) {
    const tbody = document.getElementById('tbody-audit-logs');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color: var(--text-dim);">No hay registros de auditoría recientes.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `
        <tr>
          <td><small style="color: var(--text-dim);">${timeStr}</small></td>
          <td><span class="badge badge-info">${log.action}</span></td>
          <td><strong>${log.user}</strong></td>
          <td><span class="badge badge-neutral">${log.center}</span></td>
          <td><code>${log.sku || log.targetId || '-'}</code></td>
          <td><small>${log.details || log.reason || (log.previousQty !== null ? `Prev: ${log.previousQty} -> Nuevo: ${log.newQty}` : '')}</small></td>
        </tr>
      `;
    }).join('');
  }
};
