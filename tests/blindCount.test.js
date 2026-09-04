const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const inventoryService = require('../src/services/inventoryService');
const storagePath = require('../src/services/storagePath');

test('Conteo Ciego (Blind Count) & Data Privacy Contracts', async (t) => {
  const auxiliarUser = {
    id: 'USR-AUX-WARNES-1',
    username: 'auxiliar_warnes',
    role: 'AUXILIAR',
    center: 'WARNES'
  };

  const adminUser = {
    id: 'USR-SUPERADMIN-ALONSO',
    username: 'ALONSO',
    role: 'ADMIN',
    center: 'GLOBAL',
    isSuperadmin: true
  };

  const invId = 'INV-CICLICO-BLIND-TEST';
  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Test Conteo Ciego',
    type: 'CICLICO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    assignedAuxiliars: ['auxiliar_warnes'],
    items: [
      {
        id: 'ITEM-TEST-01',
        SKU: 'JD-AH12345',
        Codigo_Barras: '78912345601',
        Descripcion: 'Filtro Test',
        Ubicacion: 'RACK-A1-01',
        Categoria: 'FILTROS',
        Clasificacion_ABC: 'A',
        Unidad: 'PZA',
        Costo_Unitario: 45.50,
        Stock_Sistema: 10,
        Stock_Fisico: null,
        Diferencia: 0,
        Costo_Diferencia: 0,
        Responsable: 'auxiliar_warnes',
        Estado: 'Pendiente',
        Mal_estado: 0
      }
    ]
  });

  await t.test('Auxiliar must NOT see hidden system columns during count', () => {
    const inv = inventoryService.getInventoryById(invId, auxiliarUser);
    assert.strictEqual(inv.isBlindCount, true);

    inv.items.forEach(item => {
      assert.strictEqual(item.Stock_Sistema, undefined, 'Stock_Sistema (Col I) must be hidden from Auxiliar');
      assert.strictEqual(item.Diferencia, undefined, 'Diferencia (Col K) must be hidden from Auxiliar');
      assert.strictEqual(item.Costo_Unitario, undefined, 'Costo_Unitario (Col H) must be hidden from Auxiliar');
      assert.strictEqual(item.Costo_Diferencia, undefined, 'Costo_Diferencia (Col L) must be hidden from Auxiliar');
      assert.strictEqual(item.Estado, undefined, 'Estado (Col O) must be hidden from Auxiliar');
      
      // But visible operational columns MUST exist
      assert.ok(item.SKU, 'SKU (Col A) must be present');
      assert.ok(item.Descripcion, 'Descripcion (Col C) must be present');
      assert.ok(item.Ubicacion, 'Ubicacion (Col D) must be present');
    });
  });

  await t.test('Admin must see full system columns', () => {
    const inv = inventoryService.getInventoryById(invId, adminUser);
    assert.strictEqual(inv.isBlindCount, false);

    const firstItem = inv.items[0];
    assert.notStrictEqual(firstItem.Stock_Sistema, undefined);
    assert.notStrictEqual(firstItem.Costo_Unitario, undefined);
    assert.notStrictEqual(firstItem.Diferencia, undefined);
  });

  t.after(() => {
    try {
      const filePath = path.join(storagePath.getInventoriesDirectory(), `${invId}.json`);
      storagePath.deleteFile(filePath);
    } catch (e) {}
  });
});
