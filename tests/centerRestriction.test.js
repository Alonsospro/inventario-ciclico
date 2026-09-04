const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const authService = require('../src/services/authService');
const inventoryService = require('../src/services/inventoryService');
const storagePath = require('../src/services/storagePath');
const config = require('../src/config');

test('Official Centers and Users Roster Verification', async (t) => {
  // Ensure seed is up to date
  authService.seedDefaultUsers(true);
  const users = authService.getUsersList();

  await t.test('All 14 Official Centers must be registered', () => {
    assert.strictEqual(config.centersList.length, 14);
    const expectedCodes = ['1120', '1160', '1180', '1300', '1310', '1340', '1700', '1800', '1820', '2100', '2150', '3100', '3200', '5100'];
    expectedCodes.forEach(code => {
      const found = config.findCenter(code);
      assert.ok(found, `Center ${code} must exist in centersList`);
    });
  });

  await t.test('Volvo - Km 14 (1120) Users authenticate properly by USUARIO and CLAVE', () => {
    // Encargado by USUARIO
    const enc = authService.authenticate('Isaias', 'IA2351');
    assert.strictEqual(enc.user.displayName, 'Isaias Burgos Arandia');
    assert.strictEqual(enc.user.username, 'Isaias');
    assert.strictEqual(enc.user.role, 'ENCARGADO');
    assert.strictEqual(enc.user.center, '1120');

    // Also Ignacio as Encargado in 1120
    const enc2 = authService.authenticate('Ignacio', 'IJ6508');
    assert.strictEqual(enc2.user.displayName, 'Ignacio Suarez Justiniano');
    assert.strictEqual(enc2.user.role, 'ENCARGADO');
    assert.strictEqual(enc2.user.center, '1120');

    // Also by CLAVE
    const encByClave = authService.authenticate('IA2351', 'IA2351');
    assert.strictEqual(encByClave.user.username, 'Isaias');

    // Auxiliares by USUARIO
    const aux1 = authService.authenticate('Bladimir', 'BA0856');
    assert.strictEqual(aux1.user.displayName, 'Bladimir Avalos');
    assert.strictEqual(aux1.user.role, 'AUXILIAR');
    assert.strictEqual(aux1.user.center, '1120');

    const aux2 = authService.authenticate('Fernando', 'LT3970');
    assert.strictEqual(aux2.user.displayName, 'Luis Fernando Torrico');

    const aux3 = authService.authenticate('Brayan', 'BB3078');
    assert.strictEqual(aux3.user.displayName, 'Brayan Balderrama');

    const aux4 = authService.authenticate('Wenderson', 'WS8386');
    assert.strictEqual(aux4.user.displayName, 'Wenderson Da silva');

    const aux5 = authService.authenticate('Guillermo', 'GJ5408');
    assert.strictEqual(aux5.user.displayName, 'Guillermo López Jaillita');
    assert.strictEqual(aux5.user.role, 'AUXILIAR');
    assert.strictEqual(aux5.user.center, '1120');

    const aux6 = authService.authenticate('Reynaldo', 'RA6326');
    assert.strictEqual(aux6.user.displayName, 'Reynaldo Aguilar');
    assert.strictEqual(aux6.user.role, 'AUXILIAR');
    assert.strictEqual(aux6.user.center, '1120');
  });

  await t.test('John Deere - Km 10 (1300) Encargado & Auxiliares authenticate properly', () => {
    const enc = authService.authenticate('Javier', 'JL8764');
    assert.strictEqual(enc.user.displayName, 'Javier Eduardo López');
    assert.strictEqual(enc.user.role, 'ENCARGADO');
    assert.strictEqual(enc.user.center, '1300');

    const auxMan = authService.authenticate('Manuel', 'JD7094');
    assert.strictEqual(auxMan.user.displayName, 'Jose Manuel Duran');

    const auxFer2 = authService.authenticate('Fernando2', 'FP3189');
    assert.strictEqual(auxFer2.user.displayName, 'Fernando Pinto');

    const auxMor = authService.authenticate('Morales', 'EM5962');
    assert.strictEqual(auxMor.user.displayName, 'Erick Morales');
    assert.strictEqual(auxMor.user.role, 'AUXILIAR');
    assert.strictEqual(auxMor.user.center, '1300');
  });

  await t.test('Administrators and Superadmin authenticate with GLOBAL access', () => {
    const abs = authService.authenticate('Absael', 'ABS');
    assert.strictEqual(abs.user.displayName, 'Absael Antelo');
    assert.strictEqual(abs.user.username, 'Absael');
    assert.strictEqual(abs.user.role, 'ADMIN');
    assert.strictEqual(abs.user.center, 'GLOBAL');

    const jcs = authService.authenticate('Jcarlos', 'JCS');
    assert.strictEqual(jcs.user.displayName, 'Juan Carlos');
    assert.strictEqual(jcs.user.username, 'Jcarlos');
    assert.strictEqual(jcs.user.role, 'ADMIN');
    assert.strictEqual(jcs.user.center, 'GLOBAL');

    const adm = authService.authenticate('Alonso', 'ADM');
    assert.strictEqual(adm.user.displayName, 'Alonso Rios');
    assert.strictEqual(adm.user.username, 'Alonso');
    assert.strictEqual(adm.user.role, 'ADMIN');
    assert.strictEqual(adm.user.isSuperadmin, true);

    // Alonso by CLAVE
    const alonsoByClave = authService.authenticate('ADM', 'ADM');
    assert.strictEqual(alonsoByClave.user.isSuperadmin, true);
  });
});

test('Strict Center Access and RBAC Rules Contract', async (t) => {
  const enc1120 = authService.authenticate('IA2351', 'IA2351').user;
  const aux1300 = authService.authenticate('EM5962', 'EM5962').user;
  const aux1120 = authService.authenticate('BA0856', 'BA0856').user;
  const alonso = authService.authenticate('ADM', 'ADM').user;
  const juanCarlos = authService.authenticate('JCS', 'JCS').user;
  const absael = authService.authenticate('ABS', 'ABS').user;

  // 1. Inventory creation tests (Only Juan Carlos and Alonso)
  let inv1120 = null;
  let inv1300 = null;
  let createdUserId = null;

  await t.test('Alonso and Juan Carlos CAN create inventories', async () => {
    inv1120 = await inventoryService.createInventory({
      type: 'CICLICO',
      center: '1120',
      name: 'Inventario Test 1120 creado por Alonso',
      items: [
        { SKU: 'JD-TEST-1120', Codigo_Barras: '789001120', Descripcion: 'Filtro Test 1120', Ubicacion: 'A-01', Costo_Unitario: 10, Stock_Sistema: 5 }
      ],
      user: alonso
    });
    assert.ok(inv1120.id);
    assert.strictEqual(inv1120.center, '1120');

    inv1300 = await inventoryService.createInventory({
      type: 'CICLICO',
      center: '1300',
      name: 'Inventario Test 1300 creado por Juan Carlos',
      items: [
        { SKU: 'JD-TEST-1300', Codigo_Barras: '789001300', Descripcion: 'Filtro Test 1300', Ubicacion: 'A-02', Costo_Unitario: 20, Stock_Sistema: 8 }
      ],
      user: juanCarlos
    });
    assert.ok(inv1300.id);
    assert.strictEqual(inv1300.center, '1300');
  });

  await t.test('Encargados and Auxiliares CANNOT create inventories', async () => {
    await assert.rejects(async () => {
      await inventoryService.createInventory({
        type: 'CICLICO',
        center: '1120',
        name: 'Inventario Prohibido Encargado',
        items: [],
        user: enc1120
      });
    }, /Solo Juan Carlos y Alonso/);

    await assert.rejects(async () => {
      await inventoryService.createInventory({
        type: 'CICLICO',
        center: '1300',
        name: 'Inventario Prohibido Auxiliar',
        items: [],
        user: aux1300
      });
    }, /Solo Juan Carlos y Alonso/);
  });

  // 2. Center isolation tests for Auxiliares and Encargados
  await t.test('Auxiliar from center 1300 CANNOT access inventory of center 1120', () => {
    assert.throws(() => {
      inventoryService.getInventoryById(inv1120.id, aux1300);
    }, /No tiene permisos para acceder/);
  });

  await t.test('Auxiliar from center 1300 CANNOT count items in center 1120 inventory', () => {
    assert.throws(() => {
      inventoryService.updateCount({
        inventoryId: inv1120.id,
        sku: 'JD-TEST-1120',
        stockFisico: 5,
        user: aux1300
      });
    }, /No tiene permisos para modificar inventarios/);
  });

  await t.test('Admins (Alonso, Juan Carlos, Absael) can access inventory from any center', () => {
    const fetchedAlonso = inventoryService.getInventoryById(inv1120.id, alonso);
    assert.ok(fetchedAlonso);
    assert.strictEqual(fetchedAlonso.id, inv1120.id);

    const fetchedJC = inventoryService.getInventoryById(inv1120.id, juanCarlos);
    assert.ok(fetchedJC);
    assert.strictEqual(fetchedJC.id, inv1120.id);

    const fetchedAbs = inventoryService.getInventoryById(inv1120.id, absael);
    assert.ok(fetchedAbs);
    assert.strictEqual(fetchedAbs.id, inv1120.id);
  });

  // 3. Task assignment tests by Encargados
  await t.test('Encargado 1120 CAN reassign tasks to auxiliaries within center 1120', () => {
    const item = inv1120.items[0];
    const res = inventoryService.reassignTasks({
      inventoryId: inv1120.id,
      itemIds: [item.id],
      toUser: aux1120.username,
      requestingUser: enc1120,
      reason: 'Asignación de turno operativo'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.count, 1);
  });

  // 4. User creation tests (Only Alonso)
  await t.test('Superadmin Alonso CAN create new users', () => {
    const uniqueUser = `test_user_${Date.now().toString(36)}`;
    const created = authService.createUser({
      username: uniqueUser,
      password: 'testpassword123',
      displayName: 'Usuario Prueba Creado por Alonso',
      role: 'AUXILIAR',
      center: '1120'
    }, alonso);
    createdUserId = created.id;
    assert.ok(created.id);
    assert.strictEqual(created.username, uniqueUser);
  });

  await t.test('Other Admins, Encargados, and Auxiliares CANNOT create new users', () => {
    assert.throws(() => {
      authService.createUser({
        username: 'unauth_by_jc',
        password: '123',
        role: 'AUXILIAR'
      }, juanCarlos);
    }, /Solo el superadministrador Alonso/);

    assert.throws(() => {
      authService.createUser({
        username: 'unauth_by_abs',
        password: '123',
        role: 'AUXILIAR'
      }, absael);
    }, /Solo el superadministrador Alonso/);

    assert.throws(() => {
      authService.createUser({
        username: 'unauth_by_enc',
        password: '123',
        role: 'AUXILIAR'
      }, enc1120);
    }, /Solo el superadministrador Alonso/);
  });

  await t.test('Encargado 1120 only gets user list from center 1120', () => {
    const list1120 = authService.getAllUsers(enc1120);
    assert.ok(list1120.length > 0);
    list1120.forEach(u => {
      assert.ok(config.isSameCenter(u.center, '1120'), `User ${u.username} center ${u.center} must be 1120`);
    });
  });

  t.after(() => {
    if (inv1120 && inv1120.id) {
      try {
        storagePath.deleteFile(path.join(storagePath.getInventoriesDirectory(), `${inv1120.id}.json`));
      } catch (e) {}
    }
    if (inv1300 && inv1300.id) {
      try {
        storagePath.deleteFile(path.join(storagePath.getInventoriesDirectory(), `${inv1300.id}.json`));
      } catch (e) {}
    }
    if (createdUserId) {
      try {
        authService.deleteUser(createdUserId, alonso);
      } catch (e) {}
    }
  });
});

