const test = require('node:test');
const assert = require('node:assert');
const inventoryService = require('../src/services/inventoryService');

test('Confirm Count with 0 Quantity and Audit Trail', async (t) => {
  const user = { username: 'auxiliar_warnes', role: 'AUXILIAR', center: 'WARNES' };
  const invId = 'INV-ZERO-TEST';

  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Test Cero',
    type: 'CICLICO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    assignedAuxiliars: ['auxiliar_warnes'],
    items: [
      {
        id: 'ITEM-Z1',
        SKU: 'JD-Z001',
        Descripcion: 'Item con conteo cero',
        Ubicacion: 'RACK-Z1',
        Stock_Sistema: 5,
        Stock_Fisico: null,
        Diferencia: 0,
        Costo_Unitario: 20,
        Responsable: 'auxiliar_warnes'
      }
    ]
  });

  await t.test('Should allow confirming physical count with quantity 0', () => {
    const res = inventoryService.updateCount({
      inventoryId: invId,
      itemId: 'ITEM-Z1',
      stockFisico: 0,
      malEstado: 0,
      user,
      reason: 'Confirmación sin stock en estante'
    });

    assert.ok(res.success);
    assert.strictEqual(res.item.Stock_Fisico, 0);
    assert.strictEqual(res.item.Diferencia, -5);
    assert.strictEqual(res.item.Costo_Diferencia, -100);
    assert.strictEqual(res.item.Estado, 'Contado');
  });
});
