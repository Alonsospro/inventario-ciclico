const test = require('node:test');
const assert = require('node:assert');
const metricsService = require('../src/services/metricsService');

test('Dashboard Metrics & ERU Calculation Tests', async (t) => {
  await t.test('Metrics calculation returns structured summary with ERU', () => {
    const metrics = metricsService.getDashboardMetrics({
      type: 'TODOS',
      center: 'TODOS'
    });

    assert.ok(metrics.summary);
    assert.strictEqual(typeof metrics.summary.eruPercent, 'number');
    assert.strictEqual(typeof metrics.summary.globalAccuracyPercent, 'number');
    assert.strictEqual(typeof metrics.summary.totalAbsoluteDiffCost, 'number');
    assert.ok(metrics.abcBreakdown.A);
    assert.ok(metrics.abcBreakdown.B);
    assert.ok(metrics.abcBreakdown.C);
  });

  await t.test('Filter by inventory type restricts data accordingly', () => {
    const metricsBarrido = metricsService.getDashboardMetrics({
      type: 'BARRIDO',
      center: 'TODOS'
    });

    assert.strictEqual(metricsBarrido.filters.type, 'BARRIDO');
    assert.ok(metricsBarrido.summary.totalInventories >= 0);
  });

  await t.test('Period presets and individual inventory filtering work correctly', () => {
    const metricsMonth = metricsService.getDashboardMetrics({
      type: 'TODOS',
      center: 'TODOS',
      period: 'ESTE_MES'
    });

    assert.ok(Array.isArray(metricsMonth.availableInventories), 'availableInventories must be an array');
    assert.strictEqual(metricsMonth.filters.period, 'ESTE_MES');

    if (metricsMonth.availableInventories.length > 0) {
      const targetInvId = metricsMonth.availableInventories[0].id;
      const metricsSingle = metricsService.getDashboardMetrics({
        type: 'TODOS',
        center: 'TODOS',
        inventoryId: targetInvId
      });

      assert.strictEqual(metricsSingle.summary.totalInventories, 1, 'Single inventory must yield totalInventories = 1');
      assert.ok(metricsSingle.selectedInventory, 'selectedInventory must be returned');
      assert.strictEqual(metricsSingle.selectedInventory.id, targetInvId);
      assert.strictEqual(metricsSingle.isSingleInventory, true);
    }
  });
});
