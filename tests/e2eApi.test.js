const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const app = require('../server');
const authService = require('../src/services/authService');
const inventoryService = require('../src/services/inventoryService');
const storagePath = require('../src/services/storagePath');

// Helper to make fast internal HTTP calls to the express app without starting external network server
test('E2E HTTP API Endpoint Tests', async (t) => {
  let server;
  let baseUrl;
  let adminToken;
  let auxiliarToken;
  const testInvId = 'INV-E2E-TEST-001';

  await t.test('Setup test HTTP server', async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    const adminAuth = authService.authenticate('ALONSO', 'alonso.superadmin2026');
    adminToken = adminAuth.token;

    const auxAuth = authService.authenticate('auxiliar_warnes', 'auxiliar2026');
    auxiliarToken = auxAuth.token;

    // Seed test inventory fixture
    inventoryService.saveInventory({
      id: testInvId,
      name: 'Inventario Test E2E',
      type: 'CICLICO',
      center: 'WARNES',
      status: 'EN_PROGRESO',
      items: [
        {
          id: 'ITEM-E2E-01',
          SKU: 'JD-AH12345',
          Codigo_Barras: '78912345601',
          Descripcion: 'Filtro de Aceite Motor 6068',
          Ubicacion: 'RACK-A1-01',
          Stock_Sistema: 10,
          Stock_Fisico: null,
          Costo_Unitario: 45.5,
          Responsable: 'auxiliar_warnes'
        }
      ]
    });
  });

  await t.test('GET /api/health returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
  });

  await t.test('POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ALONSO', password: 'alonso.superadmin2026' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.token);
  });

  await t.test('GET /api/inventories returns inventory list for Auxiliar with center scoping', async () => {
    const res = await fetch(`${baseUrl}/inventories`, {
      headers: { 'Authorization': `Bearer ${auxiliarToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.inventories));
  });

  await t.test('GET /api/barrido/search finds item and normalizes code', async () => {
    const res = await fetch(`${baseUrl}/barrido/search?q=78912345601&center=WARNES`, {
      headers: { 'Authorization': `Bearer ${auxiliarToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.item.SKU, 'JD-AH12345');
  });

  await t.test('GET /api/justifications returns 200 for Admin and 403 for Auxiliar', async () => {
    const adminRes = await fetch(`${baseUrl}/justifications`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.strictEqual(adminData.success, true);
    assert.ok(Array.isArray(adminData.tasks));

    const auxRes = await fetch(`${baseUrl}/justifications`, {
      headers: { 'Authorization': `Bearer ${auxiliarToken}` }
    });
    assert.strictEqual(auxRes.status, 403);
  });

  await t.test('GET /api/dashboard/metrics returns KPIs & ERU percentage', async () => {
    const res = await fetch(`${baseUrl}/dashboard/metrics?type=TODOS`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.summary);
    assert.strictEqual(typeof data.summary.eruPercent, 'number');
  });

  t.after(async () => {
    try {
      storagePath.deleteFile(path.join(storagePath.getInventoriesDirectory(), `${testInvId}.json`));
    } catch (e) {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
