const test = require('node:test');
const assert = require('node:assert');
const inventoryService = require('../src/services/inventoryService');

test('Reassignments and Center Restraints', async (t) => {
  const encargadoWarnes = {
    username: 'encargado_warnes',
    role: 'ENCARGADO',
    center: 'WARNES'
  };

  const auxiliarWarnes = {
    username: 'auxiliar_warnes',
    role: 'AUXILIAR',
    center: 'WARNES'
  };

  const invId = 'INV-TEST-REASSIGN-001';

  // Setup test inventory
  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Test Reasignaciones',
    type: 'BARRIDO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    assignedAuxiliars: ['auxiliar_warnes'],
    items: [
      {
        id: 'ITEM-R-01',
        SKU: 'JD-AH12345',
        Descripcion: 'Filtro Aceite',
        Ubicacion: 'RACK-A1',
        Stock_Sistema: 10,
        Responsable: 'auxiliar_warnes'
      }
    ]
  });

  await t.test('Encargado can reassign items without duplicating pending records', () => {
    const raw = inventoryService.getInventoryRaw(invId);
    const itemIds = [raw.items[0].id];

    const res = inventoryService.reassignTasks({
      inventoryId: invId,
      itemIds,
      toUser: 'auxiliar_warnes2',
      requestingUser: encargadoWarnes,
      reason: 'Reasignación operativa de prueba'
    });

    assert.ok(res.success);
    assert.strictEqual(res.toUser, 'auxiliar_warnes2');

    const updatedRaw = inventoryService.getInventoryRaw(invId);
    const updatedItem = updatedRaw.items.find(i => i.id === itemIds[0]);
    assert.strictEqual(updatedItem.Responsable, 'auxiliar_warnes2');
  });

  await t.test('Auxiliar cannot reassign items (must throw permission error)', () => {
    const raw = inventoryService.getInventoryRaw(invId);
    assert.throws(() => {
      inventoryService.reassignTasks({
        inventoryId: invId,
        itemIds: [raw.items[0].id],
        toUser: 'auxiliar_warnes',
        requestingUser: auxiliarWarnes,
        reason: 'Intento no permitido'
      });
    }, /no tienen permisos/);
  });

  // Teardown
  inventoryService.deleteInventory({
    inventoryId: invId,
    user: { username: 'admin', role: 'ADMIN', isSuperadmin: true },
    deleteKey: 'ADM26'
  });
});
