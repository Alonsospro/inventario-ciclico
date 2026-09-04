const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const inventoryService = require('../src/services/inventoryService');
const storagePath = require('../src/services/storagePath');

test('Delete Inventory Authorization & ADM26 Key Verification', async (t) => {
  const adminUser = { username: 'ALONSO', role: 'ADMIN', center: 'GLOBAL', isSuperadmin: true };
  const encargadoWarnes = { username: 'Isaias', role: 'ENCARGADO', center: '1120' };
  const encargado1300 = { username: 'Javier', role: 'ENCARGADO', center: '1300' };
  const auxiliarWarnes = { username: 'Bladimir', role: 'AUXILIAR', center: '1120' };

  // Setup sample inventory for center 1120
  const invId1 = 'INV-TEST-DEL-1120';
  inventoryService.saveInventory({
    id: invId1,
    name: 'Inventario Test Borrado 1120',
    type: 'CICLICO',
    center: '1120',
    status: 'EN_PROGRESO',
    items: []
  });

  const invId2 = 'INV-TEST-DEL-1300';
  inventoryService.saveInventory({
    id: invId2,
    name: 'Inventario Test Borrado 1300',
    type: 'CICLICO',
    center: '1300',
    status: 'EN_PROGRESO',
    items: []
  });

  await t.test('Encargado 1120 can delete inventory from center 1120 with key ADM26', () => {
    const res = inventoryService.deleteInventory({
      inventoryId: invId1,
      user: encargadoWarnes,
      deleteKey: 'ADM26',
      reason: 'Prueba de eliminación por encargado'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(inventoryService.getInventoryRaw(invId1), null, 'Inventory must no longer exist');
  });

  await t.test('Encargado 1120 CANNOT delete inventory from center 1300', () => {
    assert.throws(() => {
      inventoryService.deleteInventory({
        inventoryId: invId2,
        user: encargadoWarnes,
        deleteKey: 'ADM26',
        reason: 'Intento de eliminación no autorizada'
      });
    }, /No puede eliminar inventarios del centro/);
  });

  await t.test('Admin can delete inventory from any center with key ADM26 (case-insensitive)', () => {
    const res = inventoryService.deleteInventory({
      inventoryId: invId2,
      user: adminUser,
      deleteKey: 'adm26',
      reason: 'Eliminación por Administrador con minúsculas'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(inventoryService.getInventoryRaw(invId2), null, 'Inventory must no longer exist');
  });

  await t.test('Wrong key must reject deletion with clear error', () => {
    const invId3 = 'INV-TEST-DEL-KEY';
    inventoryService.saveInventory({
      id: invId3,
      name: 'Inventario Test Clave',
      type: 'CICLICO',
      center: '1120',
      status: 'EN_PROGRESO',
      items: []
    });

    assert.throws(() => {
      inventoryService.deleteInventory({
        inventoryId: invId3,
        user: adminUser,
        deleteKey: 'WRONG_KEY',
        reason: 'Prueba clave incorrecta'
      });
    }, /Clave de confirmación de eliminación incorrecta/);

    // Clean up
    inventoryService.deleteInventory({
      inventoryId: invId3,
      user: adminUser,
      deleteKey: 'ADM26',
      reason: 'Limpieza'
    });
  });

  await t.test('Auxiliar cannot delete inventory', () => {
    const invId4 = 'INV-TEST-DEL-AUX';
    inventoryService.saveInventory({
      id: invId4,
      name: 'Inventario Test Auxiliar',
      type: 'CICLICO',
      center: '1120',
      status: 'EN_PROGRESO',
      items: []
    });

    assert.throws(() => {
      inventoryService.deleteInventory({
        inventoryId: invId4,
        user: auxiliarWarnes,
        deleteKey: 'ADM26',
        reason: 'Intento de auxiliar'
      });
    }, /Solo los administradores y encargados pueden eliminar/);

    // Clean up
    inventoryService.deleteInventory({
      inventoryId: invId4,
      user: adminUser,
      deleteKey: 'ADM26',
      reason: 'Limpieza'
    });
  });

  t.after(() => {
    const ids = [invId1, invId2, 'INV-TEST-DEL-KEY', 'INV-TEST-DEL-AUX'];
    ids.forEach(id => {
      try {
        storagePath.deleteFile(path.join(storagePath.getInventoriesDirectory(), `${id}.json`));
      } catch (e) {}
    });
  });
});
