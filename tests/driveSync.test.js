const test = require('node:test');
const assert = require('node:assert');
const inventoryService = require('../src/services/inventoryService');
const driveService = require('../src/services/driveService');

test('Justification & Drive File Creation Contract', async (t) => {
  const adminUser = {
    username: 'ALONSO',
    role: 'ADMIN',
    center: 'GLOBAL',
    isSuperadmin: true
  };

  const invId = 'INV-TEST-DRIVE-WARNES-001';

  // Setup test inventory
  inventoryService.saveInventory({
    id: invId,
    name: 'Inventario Test Drive Warnes',
    type: 'CICLICO',
    center: 'WARNES',
    status: 'EN_PROGRESO',
    items: [
      {
        id: 'ITEM-D-01',
        SKU: 'JD-AH12345',
        Descripcion: 'Filtro de Aceite Motor',
        Ubicacion: 'RACK-A1-01',
        Stock_Sistema: 10,
        Stock_Fisico: 8,
        Diferencia: -2,
        Costo_Unitario: 45.5,
        Responsable: 'auxiliar_warnes'
      }
    ]
  });

  await t.test('Drive file name formatting matches contract: {tipo}-{centro}-{fecha}', () => {
    const fileName = driveService.formatInventoryFileName('CICLICO', 'WARNES', '2026-08-31');
    assert.strictEqual(fileName, 'CICLICO-WARNES-2026-08-31');
  });

  await t.test('Justification file name formatting matches: JUST-{tipo}-{sku}-{centro}', () => {
    const justName = driveService.formatJustificationName('CICLICO', 'JD-AH12345', 'WARNES');
    assert.strictEqual(justName, 'JUST-CICLICO-JD-AH12345-WARNES');
  });

  await t.test('Submitting justification should update item and audit log', () => {
    const just = inventoryService.saveJustification({
      inventoryId: invId,
      sku: 'JD-AH12345',
      justification: 'Diferencia justificada por ajuste de merma',
      photoUrl: '/api/photos/sample.jpg',
      reasonType: 'MERMA_ROTURA',
      user: adminUser
    });

    assert.ok(just);
    assert.strictEqual(just.sku, 'JD-AH12345');
    assert.strictEqual(just.status, 'REVISADO');
  });

  await t.test('Terminar revisión must generate Drive file record and close inventory', async () => {
    const res = await inventoryService.finishReviewAndClose({
      inventoryId: invId,
      user: adminUser,
      reviewNotes: 'Aprobado por Superadmin'
    });

    assert.ok(res.success);
    assert.strictEqual(res.inventory.status, 'REVISADO');
    assert.ok(res.drive.fileName.startsWith('CICLICO-WARNES-'));
    assert.ok(res.drive.fileId);
  });

  await t.test('createFinalDriveFile preserves center 1300 and does NOT fallback to 1120', async () => {
    const inv1300 = {
      id: 'INV-TEST-1300-001',
      type: 'CICLICO',
      center: '1300',
      items: [{ SKU: 'SKU-1', Codigo_Barras: 'BAR-1', Descripcion: 'Item 1', Stock_Sistema: 5, Stock_Fisico: 5 }]
    };
    const driveRes = await driveService.createFinalDriveFile({
      inventory: inv1300,
      justifications: [],
      user: adminUser,
      reviewNotes: 'Test 1300'
    });
    assert.ok(driveRes.fileName.startsWith('CICLICO-1300-'), `FileName should start with CICLICO-1300-, got: ${driveRes.fileName}`);
  });

  // Teardown
  inventoryService.deleteInventory({
    inventoryId: invId,
    user: adminUser,
    deleteKey: 'ADM26'
  });
});
