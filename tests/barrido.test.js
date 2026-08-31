const test = require('node:test');
const assert = require('node:assert');
const inventoryService = require('../src/services/inventoryService');

test('Barrido Dedicated Mode & Code Normalization', async (t) => {
  await t.test('Should find product by barcode WITH JD_ prefix', () => {
    const res = inventoryService.searchProductForBarrido({
      barcodeOrSku: 'JD_78912345601',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Should find product by barcode WITHOUT JD_ prefix', () => {
    const res = inventoryService.searchProductForBarrido({
      barcodeOrSku: '78912345601',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Should find product by SKU directly', () => {
    const res = inventoryService.searchProductForBarrido({
      barcodeOrSku: 'jd-ah12345',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Mal_estado always stored in Columna P', () => {
    const user = { username: 'auxiliar_warnes', role: 'AUXILIAR', center: 'WARNES' };
    const res = inventoryService.updateCount({
      inventoryId: 'INV-BARRIDO-WARNES-001',
      sku: 'JD-AH12345',
      stockFisico: 5,
      malEstado: 2,
      location: 'RACK-A1-01',
      isNewLocation: false,
      user
    });

    assert.ok(res.success);
    assert.strictEqual(res.item.Mal_estado, 2, 'Columna P Mal_estado must be 2');
  });
});
