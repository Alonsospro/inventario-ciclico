const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const inventoryService = require('../src/services/inventoryService');
const storagePath = require('../src/services/storagePath');

test('Multi-Location Logic & Row Appending Contract', async (t) => {
  const user = {
    username: 'auxiliar_warnes',
    role: 'AUXILIAR',
    center: 'WARNES'
  };

  const invId = `INV-MULTI-LOC-${Date.now()}`;
  const initialItem = {
    id: 'ITEM-ORIG-01',
    SKU: 'JD-TEST-LOC',
    Codigo_Barras: '11223344',
    Descripcion: 'Item Multi Ubicacion',
    Ubicacion: 'RACK-A1-01',
    Stock_Sistema: 10,
    Stock_Fisico: null,
    Diferencia: 0,
    Costo_Unitario: 50,
    Responsable: 'auxiliar_warnes'
  };

  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Test Multi Ubicacion',
    type: 'CICLICO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    assignedAuxiliars: ['auxiliar_warnes'],
    items: [initialItem]
  });

  await t.test('Counting with new location must append a new row at the end', () => {
    const rawBefore = inventoryService.getInventoryRaw(invId);
    assert.strictEqual(rawBefore.items.length, 1);

    const result = inventoryService.updateCount({
      inventoryId: invId,
      itemId: initialItem.id,
      sku: initialItem.SKU,
      stockFisico: 3,
      malEstado: 0,
      location: 'RACK-Z9-99',
      isNewLocation: true,
      user,
      reason: 'Nueva ubicación adicional encontrada'
    });

    assert.ok(result.success);
    assert.strictEqual(result.item.Ubicacion, 'RACK-Z9-99');
    assert.strictEqual(result.item.isAdditionalLocation, true);

    // Verify raw items count increased to 2
    const rawAfter = inventoryService.getInventoryRaw(invId);
    assert.strictEqual(rawAfter.items.length, 2);

    // Verify original row location is NOT overwritten
    const originalItemAfter = rawAfter.items.find(i => i.id === initialItem.id);
    assert.strictEqual(originalItemAfter.Ubicacion, 'RACK-A1-01');
    assert.strictEqual(rawAfter.items[1].Ubicacion, 'RACK-Z9-99');
    assert.strictEqual(rawAfter.items[1].Stock_Fisico, 3);
  });

  await t.test('Creating new location without immediate count must remain Pendiente and unlocked', () => {
    const result = inventoryService.updateCount({
      inventoryId: invId,
      itemId: initialItem.id,
      sku: initialItem.SKU,
      stockFisico: null,
      malEstado: 0,
      location: 'RACK-W1-10',
      isNewLocation: true,
      user,
      locked: false
    });

    assert.ok(result.success);
    assert.strictEqual(result.item.Stock_Fisico, null);
    assert.strictEqual(result.item.Estado, 'Pendiente');
    assert.strictEqual(result.item.locked, false);

    const raw = inventoryService.getInventoryRaw(invId);
    assert.strictEqual(raw.items.length, 3);
  });

  await t.test('Deleting additional location must remove it cleanly from inventory items', () => {
    const rawBefore = inventoryService.getInventoryRaw(invId);
    const itemToDelete = rawBefore.items.find(it => it.Ubicacion === 'RACK-W1-10');
    assert.ok(itemToDelete);

    const delRes = inventoryService.deleteItem({
      inventoryId: invId,
      itemId: itemToDelete.id,
      user
    });

    assert.ok(delRes.success);

    const rawAfter = inventoryService.getInventoryRaw(invId);
    assert.strictEqual(rawAfter.items.length, 2);
    assert.strictEqual(rawAfter.items.some(it => it.id === itemToDelete.id), false);
  });

  t.after(() => {
    try {
      const filePath = path.join(storagePath.getInventoriesDirectory(), `${invId}.json`);
      storagePath.deleteFile(filePath);
    } catch (e) {}
  });
});
