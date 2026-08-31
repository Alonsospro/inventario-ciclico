const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');

class MetricsService {
  constructor() {
    this.invDir = storagePath.getInventoriesDirectory();
    this.historyDir = storagePath.getHistoryDirectory();
  }

  getAllInventoriesData() {
    const activeFiles = fs.readdirSync(this.invDir).filter(f => f.endsWith('.json'));
    const historyFiles = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));

    const allInventories = [];

    activeFiles.forEach(f => {
      const inv = storagePath.readJson(path.join(this.invDir, f), null);
      if (inv && Array.isArray(inv.items)) {
        allInventories.push({ ...inv, isHistory: false });
      }
    });

    historyFiles.forEach(f => {
      const hist = storagePath.readJson(path.join(this.historyDir, f), null);
      if (hist && Array.isArray(hist.items)) {
        allInventories.push({
          id: hist.inventoryId || hist.fileId,
          name: hist.fileName,
          type: hist.type,
          center: hist.center,
          status: 'REVISADO',
          createdAt: hist.closedAt,
          items: hist.items,
          isHistory: true
        });
      }
    });

    return allInventories;
  }

  getDashboardMetrics({ type = 'TODOS', center = 'TODOS', startDate = null, endDate = null }) {
    const inventories = this.getAllInventoriesData();

    // Filter by type, center, dates
    const filtered = inventories.filter(inv => {
      if (type && type !== 'TODOS' && inv.type !== type) return false;
      if (center && center !== 'TODOS' && center !== 'GLOBAL' && inv.center !== center) return false;
      if (startDate && new Date(inv.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(inv.createdAt) > new Date(endDate)) return false;
      return true;
    });

    let totalItemsPlanned = 0;
    let totalItemsAudited = 0;
    let totalExactItems = 0;
    let totalDiscrepantItems = 0;
    let totalPositiveDiff = 0;
    let totalNegativeDiff = 0;
    let totalAbsoluteDiffCost = 0;
    let totalNetDiffCost = 0;
    let totalDamagedItems = 0;

    // Multi-location ERU calculation
    let eruMatchingItems = 0;
    let eruEvaluatedItems = 0;

    const abcBreakdown = {
      A: { total: 0, exact: 0, diffCost: 0 },
      B: { total: 0, exact: 0, diffCost: 0 },
      C: { total: 0, exact: 0, diffCost: 0 }
    };

    const centerBreakdown = {};

    filtered.forEach(inv => {
      const invCenter = inv.center || 'GENERAL';
      if (!centerBreakdown[invCenter]) {
        centerBreakdown[invCenter] = {
          center: invCenter,
          totalAudited: 0,
          exact: 0,
          diffCost: 0,
          eruSum: 0
        };
      }

      inv.items.forEach(item => {
        totalItemsPlanned++;
        const isAudited = item.Stock_Fisico !== null && item.Stock_Fisico !== undefined;
        if (!isAudited) return;

        totalItemsAudited++;
        eruEvaluatedItems++;

        const stockFisico = item.Stock_Fisico || 0;
        const stockSistema = item.Stock_Sistema || 0;
        const diff = stockFisico - stockSistema;
        const unitCost = item.Costo_Unitario || 0;
        const diffCost = diff * unitCost;
        const isAdditionalLoc = !!item.isAdditionalLocation;
        const damaged = item.Mal_estado || 0;

        if (damaged > 0) {
          totalDamagedItems += damaged;
        }

        if (diff > 0) totalPositiveDiff += diff;
        if (diff < 0) totalNegativeDiff += Math.abs(diff);

        totalAbsoluteDiffCost += Math.abs(diffCost);
        totalNetDiffCost += diffCost;

        // Exact match
        const isExact = diff === 0 && damaged === 0 && !isAdditionalLoc;
        if (isExact) {
          totalExactItems++;
          eruMatchingItems++;
        }

        // ABC breakdown
        const abc = (item.Clasificacion_ABC || 'C').toUpperCase();
        if (abcBreakdown[abc]) {
          abcBreakdown[abc].total++;
          if (isExact) abcBreakdown[abc].exact++;
          abcBreakdown[abc].diffCost += Math.abs(diffCost);
        }

        // Center breakdown
        centerBreakdown[invCenter].totalAudited++;
        if (isExact) centerBreakdown[invCenter].exact++;
        centerBreakdown[invCenter].diffCost += Math.abs(diffCost);
      });
    });

    // Accuracy %
    const globalAccuracy = totalItemsAudited > 0
      ? ((totalExactItems / totalItemsAudited) * 100).toFixed(2)
      : '100.00';

    // ERU % (Exactitud de Registro de Ubicación)
    const eruPercent = eruEvaluatedItems > 0
      ? ((eruMatchingItems / eruEvaluatedItems) * 100).toFixed(2)
      : '100.00';

    // Calculate accuracy percentages for centers
    const centerStats = Object.values(centerBreakdown).map(cb => ({
      ...cb,
      accuracy: cb.totalAudited > 0 ? ((cb.exact / cb.totalAudited) * 100).toFixed(1) : '100.0'
    }));

    return {
      filters: { type, center, startDate, endDate },
      summary: {
        totalInventories: filtered.length,
        totalItemsPlanned,
        totalItemsAudited,
        totalExactItems,
        totalDiscrepancies: totalItemsAudited - totalExactItems,
        globalAccuracyPercent: parseFloat(globalAccuracy),
        eruPercent: parseFloat(eruPercent),
        totalPositiveDiff,
        totalNegativeDiff,
        totalAbsoluteDiffCost: Math.round(totalAbsoluteDiffCost * 100) / 100,
        totalNetDiffCost: Math.round(totalNetDiffCost * 100) / 100,
        totalDamagedItems
      },
      abcBreakdown: {
        A: {
          ...abcBreakdown.A,
          accuracy: abcBreakdown.A.total > 0 ? ((abcBreakdown.A.exact / abcBreakdown.A.total) * 100).toFixed(1) : '100.0'
        },
        B: {
          ...abcBreakdown.B,
          accuracy: abcBreakdown.B.total > 0 ? ((abcBreakdown.B.exact / abcBreakdown.B.total) * 100).toFixed(1) : '100.0'
        },
        C: {
          ...abcBreakdown.C,
          accuracy: abcBreakdown.C.total > 0 ? ((abcBreakdown.C.exact / abcBreakdown.C.total) * 100).toFixed(1) : '100.0'
        }
      },
      centerStats
    };
  }
}

module.exports = new MetricsService();
