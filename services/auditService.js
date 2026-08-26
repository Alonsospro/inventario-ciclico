const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '../data/audit_counts.json');

class AuditService {
  constructor() {
    this.ensureDataFile();
  }

  ensureDataFile() {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify({ logs: [] }, null, 2), 'utf8');
    }
  }

  loadLogs() {
    try {
      this.ensureDataFile();
      const content = fs.readFileSync(AUDIT_FILE, 'utf8');
      const data = JSON.parse(content);
      return Array.isArray(data.logs) ? data.logs : [];
    } catch (err) {
      console.warn('Error reading audit_counts.json:', err.message);
      return [];
    }
  }

  saveLogs(logs) {
    try {
      this.ensureDataFile();
      fs.writeFileSync(AUDIT_FILE, JSON.stringify({ logs }, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing audit_counts.json:', err.message);
    }
  }

  /**
   * Log every count or edit/re-count event as a new immutable audit record
   */
  logCountEvent({
    centro = '1300',
    sku,
    description = '',
    location = '',
    systemStock = 0,
    physicalStock = 0,
    previousStock = null,
    isModification = false,
    unitCost = 0,
    variance = 0,
    varianceCost = 0,
    status = 'Cuadrado',
    counterName = 'Operador',
    counterUser = '',
    counterRole = 'AUXILIAR',
    notes = ''
  }) {
    const logs = this.loadLogs();
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const eventId = `AUD-${String(centro).trim()}-${Date.now().toString().slice(-6)}`;

    const isRecount = Boolean(
      isModification || 
      (previousStock !== null && previousStock !== undefined && previousStock !== '')
    );

    const type = isRecount ? 'RECONTEO_EDICION' : 'PRIMER_CONTEO';

    const newEntry = {
      id: eventId,
      centro: String(centro || '1300').trim(),
      timestamp,
      sku: String(sku).trim(),
      description: String(description || '').trim(),
      location: String(location || '').trim(),
      systemStock: Number(systemStock) || 0,
      physicalStock: Number(physicalStock) || 0,
      previousStock: isRecount ? Number(previousStock) : null,
      type,
      isRecount,
      variance: Number(variance) || 0,
      unitCost: Number(unitCost) || 0,
      varianceCost: Number(varianceCost) || 0,
      status: String(status || 'Cuadrado'),
      counterName: String(counterName || counterUser || 'Operador').trim(),
      counterUser: String(counterUser || counterName || '').trim(),
      counterRole: String(counterRole || 'AUXILIAR').toUpperCase(),
      notes: String(notes || '').trim()
    };

    // Prepend so latest appears first
    logs.unshift(newEntry);

    // Keep up to 5000 records for performance
    if (logs.length > 5000) {
      logs.length = 5000;
    }

    this.saveLogs(logs);
    return newEntry;
  }

  /**
   * Alias for logCountEvent
   */
  logCount(params) {
    return this.logCountEvent(params);
  }

  /**
   * Get filtered audit log entries
   */
  getAuditLogs({ centro = null, sku = null, operator = null, type = null, limit = 100, requestingUser = null } = {}) {
    let logs = this.loadLogs();

    let targetCentro = centro ? String(centro).trim() : null;

    // Scoping for non-admin users
    if (requestingUser) {
      const role = String(requestingUser.cargo || '').toUpperCase();
      const uCentro = String(requestingUser.centro || '').trim();
      if ((role === 'ENCARGADO' || role === 'AUXILIAR') && uCentro && uCentro !== 'TODOS') {
        targetCentro = uCentro;
      }
    }

    if (targetCentro && targetCentro !== 'TODOS') {
      logs = logs.filter(l => String(l.centro).trim() === targetCentro);
    }

    if (sku) {
      const qSku = String(sku).trim().toLowerCase();
      logs = logs.filter(l => l.sku && l.sku.toLowerCase().includes(qSku));
    }

    if (operator) {
      const qOp = String(operator).trim().toLowerCase();
      logs = logs.filter(l => 
        (l.counterName && l.counterName.toLowerCase().includes(qOp)) ||
        (l.counterUser && l.counterUser.toLowerCase().includes(qOp))
      );
    }

    if (type) {
      const qType = String(type).trim().toUpperCase();
      logs = logs.filter(l => l.type === qType);
    }

    if (limit && limit > 0) {
      logs = logs.slice(0, limit);
    }

    return logs;
  }

  /**
   * Compute Operator Efficiency & Repetition Metrics
   */
  getOperatorEfficiency({ centro = null, requestingUser = null } = {}) {
    let logs = this.loadLogs();

    let targetCentro = centro ? String(centro).trim() : null;

    if (requestingUser) {
      const role = String(requestingUser.cargo || '').toUpperCase();
      const uCentro = String(requestingUser.centro || '').trim();
      if ((role === 'ENCARGADO' || role === 'AUXILIAR') && uCentro && uCentro !== 'TODOS') {
        targetCentro = uCentro;
      }
    }

    if (targetCentro && targetCentro !== 'TODOS') {
      logs = logs.filter(l => String(l.centro).trim() === targetCentro);
    }

    // Group logs by Operator
    const operatorMap = {};

    logs.forEach(log => {
      const opKey = (log.counterName || log.counterUser || 'Operador').trim().toUpperCase();
      if (!operatorMap[opKey]) {
        operatorMap[opKey] = {
          name: log.counterName || opKey,
          user: log.counterUser || opKey,
          role: log.counterRole || 'AUXILIAR',
          centro: log.centro,
          totalActions: 0,
          firstTimeCounts: 0,
          recounts: 0,
          firstTimeExact: 0,
          firstTimeDiscrepancies: 0,
          finalExact: 0,
          finalDiscrepancies: 0,
          latestAction: log.timestamp,
          // Track unique items counted
          itemsTracked: {}
        };
      }

      const op = operatorMap[opKey];
      op.totalActions++;

      if (log.type === 'RECONTEO_EDICION' || log.isRecount) {
        op.recounts++;
      } else {
        op.firstTimeCounts++;
        if (log.variance === 0 || log.status === 'Cuadrado') {
          op.firstTimeExact++;
        } else {
          op.firstTimeDiscrepancies++;
        }
      }

      // Track final state of SKU
      op.itemsTracked[log.sku] = {
        lastVariance: log.variance,
        lastStatus: log.status,
        lastTimestamp: log.timestamp
      };

      if (!op.latestAction || new Date(log.timestamp) > new Date(op.latestAction)) {
        op.latestAction = log.timestamp;
      }
    });

    // Compute derived metrics for each operator
    const operators = Object.values(operatorMap).map(op => {
      const uniqueItemsCount = Object.keys(op.itemsTracked).length;
      let finalExactCount = 0;
      let finalDiscrepancyCount = 0;

      Object.values(op.itemsTracked).forEach(st => {
        if (st.lastVariance === 0 || st.lastStatus === 'Cuadrado') {
          finalExactCount++;
        } else {
          finalDiscrepancyCount++;
        }
      });

      // 1. First-Time Accuracy (Eficacia en 1er Conteo sin necesidad de corrección)
      const firstTimeTotal = op.firstTimeCounts;
      const firstTimeAccuracyPct = firstTimeTotal > 0
        ? Number(((op.firstTimeExact / firstTimeTotal) * 100).toFixed(1))
        : 100.0;

      // 2. Recount / Repetition Rate (% de acciones que fueron re-conteos o ediciones)
      const recountRatePct = op.totalActions > 0
        ? Number(((op.recounts / op.totalActions) * 100).toFixed(1))
        : 0.0;

      // 3. Final Accuracy Rate
      const finalAccuracyPct = uniqueItemsCount > 0
        ? Number(((finalExactCount / uniqueItemsCount) * 100).toFixed(1))
        : 100.0;

      // 4. Quality Rating Classification
      let rating = 'Excelente';
      let ratingClass = 'badge-rating-excelente';
      if (firstTimeAccuracyPct < 85 || recountRatePct > 35) {
        rating = 'En Observación';
        ratingClass = 'badge-rating-alerta';
      } else if (firstTimeAccuracyPct < 95 || recountRatePct > 15) {
        rating = 'Bueno';
        ratingClass = 'badge-rating-bueno';
      }

      return {
        name: op.name,
        user: op.user,
        role: op.role,
        centro: op.centro,
        totalActions: op.totalActions,
        uniqueItems: uniqueItemsCount,
        firstTimeCounts: op.firstTimeCounts,
        recounts: op.recounts,
        recountRatePct,
        firstTimeExact: op.firstTimeExact,
        firstTimeDiscrepancies: op.firstTimeDiscrepancies,
        firstTimeAccuracyPct,
        finalExact: finalExactCount,
        finalDiscrepancies: finalDiscrepancyCount,
        finalAccuracyPct,
        rating,
        ratingClass,
        latestAction: op.latestAction
      };
    });

    // Sort operators by total actions descending
    operators.sort((a, b) => b.totalActions - a.totalActions);

    // Global summary
    const totalLogs = logs.length;
    const totalRecounts = logs.filter(l => l.type === 'RECONTEO_EDICION' || l.isRecount).length;
    const totalFirstTime = totalLogs - totalRecounts;
    const globalRecountRate = totalLogs > 0 ? Number(((totalRecounts / totalLogs) * 100).toFixed(1)) : 0;
    
    let sumFirstTimeAcc = 0;
    operators.forEach(op => { sumFirstTimeAcc += op.firstTimeAccuracyPct; });
    const avgOperatorAccuracy = operators.length > 0 ? Number((sumFirstTimeAcc / operators.length).toFixed(1)) : 100.0;

    return {
      centro: targetCentro || 'TODOS',
      totalLogs,
      totalRecounts,
      totalFirstTime,
      globalRecountRate,
      avgOperatorAccuracy,
      operatorCount: operators.length,
      operators,
      recentAuditFeed: logs.slice(0, 15)
    };
  }
}

module.exports = new AuditService();
