const test = require('node:test');
const assert = require('node:assert');
const inventoryService = require('../src/services/inventoryService');

test('Barrido Dedicated Mode & Code Normalization', async (t) => {
  const invId = 'INV-TEST-BARRIDO-001';
  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Barrido Test',
    type: 'BARRIDO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    items: [
      {
        id: 'ITEM-B-01',
        SKU: 'JD-AH12345',
        Codigo_Barras: 'JD_78912345601',
        Descripcion: 'Filtro de Aceite Motor 6068',
        Ubicacion: 'RACK-A1-01',
        Stock_Sistema: 10,
        Stock_Fisico: null,
        Diferencia: 0,
        Costo_Unitario: 45.5,
        Responsable: 'auxiliar_warnes'
      }
    ]
  });

  await t.test('Should find product by barcode WITH JD_ prefix', async () => {
    const res = await inventoryService.searchProductForBarrido({
      barcodeOrSku: 'JD_78912345601',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Should find product by barcode WITHOUT JD_ prefix', async () => {
    const res = await inventoryService.searchProductForBarrido({
      barcodeOrSku: '78912345601',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Should find product by SKU directly', async () => {
    const res = await inventoryService.searchProductForBarrido({
      barcodeOrSku: 'jd-ah12345',
      center: 'WARNES'
    });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.item.SKU, 'JD-AH12345');
  });

  await t.test('Mal_estado always stored in Columna P', () => {
    const user = { username: 'auxiliar_warnes', role: 'AUXILIAR', center: 'WARNES' };
    const res = inventoryService.updateCount({
      inventoryId: invId,
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

  await t.test('Custom description for newly discovered item in Barrido', () => {
    const user = { username: 'auxiliar_warnes', role: 'AUXILIAR', center: 'WARNES' };
    const customDesc = 'Bomba Hidráulica Auxiliar John Deere Reacondicionada';
    const res = inventoryService.updateCount({
      inventoryId: invId,
      sku: 'SKU-DISCOVERED-999',
      descripcion: customDesc,
      stockFisico: 3,
      malEstado: 0,
      location: 'RACK-Z-99',
      isNewLocation: false,
      user
    });

    assert.ok(res.success);
    assert.strictEqual(res.item.Descripcion, customDesc, 'Newly discovered item must save the custom description');
    assert.strictEqual(res.item.Stock_Fisico, 3);
  });

  // Teardown
  inventoryService.deleteInventory({
    inventoryId: invId,
    user: { username: 'admin', role: 'ADMIN', isSuperadmin: true },
    deleteKey: 'ADM26'
  });
});
