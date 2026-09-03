const test = require('node:test');
const assert = require('node:assert');
const metricsService = require('../src/services/metricsService');
const auditService = require('../src/services/auditService');

test('Contadores Accuracy, Re-editions Tracking and Full Metrics Verification', async (t) => {
  // 1. Simulate audit log re-editions for a worker
  auditService.logCount({
    inventoryId: 'INV-TEST-EDITS',
    sku: 'JD-TEST-REEDIT-1',
    previousQty: null,
    newQty: 10,
    user: 'test_worker_1',
    center: 'WARNES',
    location: 'RACK-A1'
  });

  // Second count on the same item (Re-edition / Correction)
  auditService.logCount({
    inventoryId: 'INV-TEST-EDITS',
    sku: 'JD-TEST-REEDIT-1',
    previousQty: 10,
    newQty: 8,
    user: 'test_worker_1',
    center: 'WARNES',
    location: 'RACK-A1',
    reason: 'Recuento corregido por segunda pasada'
  });

  await t.test('Metrics calculation includes comprehensive ERI, ERU, Cuadrados and Discrepancias', () => {
    const metrics = metricsService.getDashboardMetrics({ type: 'TODOS', center: 'TODOS' });

    assert.ok(metrics.summary, 'Summary must exist');
    assert.strictEqual(typeof metrics.summary.eriPercent, 'number', 'ERI % must be a number');
    assert.strictEqual(typeof metrics.summary.eruPercent, 'number', 'ERU % must be a number');
    assert.strictEqual(typeof metrics.summary.totalExactItems, 'number', 'totalExactItems must be a number');
    assert.ok(metrics.summary.discrepancias, 'discrepancias object must exist');
    assert.strictEqual(typeof metrics.summary.discrepancias.sobrantes.itemsCount, 'number');
    assert.strictEqual(typeof metrics.summary.discrepancias.sobrantes.units, 'number');
    assert.strictEqual(typeof metrics.summary.discrepancias.faltantes.itemsCount, 'number');
    assert.strictEqual(typeof metrics.summary.discrepancias.faltantes.units, 'number');
    assert.ok(metrics.summary.impactoFinanciero, 'impactoFinanciero object must exist');
    assert.strictEqual(typeof metrics.summary.impactoFinanciero.totalAbsoluteDiffCost, 'number');
  });

  await t.test('Worker stats track re-editions count and first pass accuracy', () => {
    const metrics = metricsService.getDashboardMetrics({ type: 'TODOS', center: 'TODOS' });
    assert.ok(Array.isArray(metrics.workerStats), 'workerStats must be an array');

    const worker1 = metrics.workerStats.find(w => w.worker === 'test_worker_1');
    if (worker1) {
      assert.ok(worker1.reEditCount >= 1, 'Worker 1 must have at least 1 re-edition logged');
      assert.ok(typeof worker1.firstPassRate === 'number', 'firstPassRate must be a number');
      assert.ok(typeof worker1.reEditRate === 'number', 'reEditRate must be a number');
      assert.ok(typeof worker1.effectiveAccuracy === 'number', 'Worker effectiveAccuracy must be calculated');
      assert.ok(worker1.rating, 'Worker rating must be assigned');
      assert.ok(Array.isArray(worker1.reEditHistory), 'Worker reEditHistory must be an array');
    }
  });

  await t.test('Unlock requests log audit event and update item stats', () => {
    const unlockLog = auditService.logUnlockRequest({
      inventoryId: 'INV-TEST-EDITS',
      itemId: 'ITEM-TEST-1',
      sku: 'JD-TEST-REEDIT-1',
      user: 'test_worker_1',
      center: 'WARNES',
      location: 'RACK-A1',
      previousQty: 8,
      reason: 'Conteo corregido por verificación de empaque'
    });

    assert.ok(unlockLog.id, 'Unlock log must be generated');
    assert.strictEqual(unlockLog.action, 'COUNT_UNLOCK_REQUESTED');
    assert.strictEqual(unlockLog.previousQty, 8);
  });

  await t.test('Multi-location SKUs are tracked with location counts', () => {
    const metrics = metricsService.getDashboardMetrics({ type: 'TODOS', center: 'TODOS' });
    assert.ok(Array.isArray(metrics.multiLocationSkus), 'multiLocationSkus must be an array');
    assert.ok(metrics.summary.multiLocation, 'multiLocation summary must exist');
  });
});
