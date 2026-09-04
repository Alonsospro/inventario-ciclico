const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('E2E Verification of Mobile UI, Barrido Description, and Contract Adjustments', async (t) => {
  const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  await t.test('1. BARRIDO must not be an option in filter-inv-type dropdown', () => {
    const filterMatch = indexHtml.match(/<select id="filter-inv-type"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(filterMatch, 'filter-inv-type select element must exist');
    assert.strictEqual(
      filterMatch[1].includes('value="BARRIDO"'),
      false,
      'filter-inv-type must not contain BARRIDO'
    );
  });

  await t.test('2. BARRIDO must not be an option in new-inv-type modal dropdown', () => {
    const newInvMatch = indexHtml.match(/<select id="new-inv-type"[^>]*>([\s\S]*?)<\/select>/);
    assert.ok(newInvMatch, 'new-inv-type select element must exist');
    assert.strictEqual(
      newInvMatch[1].includes('value="BARRIDO"'),
      false,
      'new-inv-type must not contain BARRIDO'
    );
  });

  await t.test('3. barrido-desc-input-container and barrido-input-desc exist in index.html', () => {
    assert.ok(indexHtml.includes('id="barrido-desc-input-container"'), 'barrido-desc-input-container must exist');
    assert.ok(indexHtml.includes('id="barrido-input-desc"'), 'barrido-input-desc input must exist');
  });

  await t.test('4. modal-app-confirm exists for confirmation prompt in index.html', () => {
    assert.ok(indexHtml.includes('id="modal-app-confirm"'), 'modal-app-confirm must exist');
    assert.ok(indexHtml.includes('id="modal-app-confirm-title"'), 'modal-app-confirm-title must exist');
    assert.ok(indexHtml.includes('id="modal-app-confirm-message"'), 'modal-app-confirm-message must exist');
    assert.ok(indexHtml.includes('id="modal-app-confirm-ok-btn"'), 'modal-app-confirm-ok-btn must exist');
    assert.ok(indexHtml.includes('id="modal-app-confirm-cancel-btn"'), 'modal-app-confirm-cancel-btn must exist');
  });

  await t.test('5. Reference photo button is removed from inventory counting table rows', () => {
    const invViewPath = path.join(__dirname, '..', 'public', 'js', 'views', 'inventoryView.js');
    const invView = fs.readFileSync(invViewPath, 'utf8');
    const renderTableFn = invView.match(/renderCountTable\(\)\s*\{[\s\S]*?tbody\.innerHTML\s*=[\s\S]*?join\(''\);/);
    assert.ok(renderTableFn, 'renderCountTable must exist');
    assert.strictEqual(
      renderTableFn[0].includes('showReferencePhoto'),
      false,
      'renderCountTable rows must NOT include showReferencePhoto button'
    );
  });

  await t.test('6. responsive.css contains mobile card adaptations and safeguards', () => {
    const respPath = path.join(__dirname, '..', 'public', 'css', 'responsive.css');
    const respCss = fs.readFileSync(respPath, 'utf8');
    assert.ok(respCss.includes('@media (max-width: 768px)'), 'responsive.css must have mobile media queries');
    assert.ok(respCss.includes('#table-count-items'), 'responsive.css must format #table-count-items');
    assert.ok(respCss.includes('.modal-box'), 'responsive.css must constrain modal size on small viewports');
  });

  await t.test('7. API /api/barrido/count accepts and persists custom descripcion', async () => {
    const inventoryService = require('../src/services/inventoryService');
    const testInvId = 'INV-BARRIDO-TEST-E2E';

    inventoryService.saveInventory({
      id: testInvId,
      name: 'Barrido Test E2E',
      type: 'BARRIDO',
      center: '1120',
      status: 'EN_PROGRESO',
      items: []
    });

    const customDesc = 'Alternador Heavy Duty 24V John Deere';
    const result = inventoryService.updateCount({
      inventoryId: testInvId,
      sku: 'SKU-ALT-24V',
      descripcion: customDesc,
      stockFisico: 4,
      malEstado: 0,
      location: 'RACK-M-12',
      isNewLocation: false,
      user: { username: 'alonso', role: 'ADMIN', isSuperadmin: true }
    });

    assert.ok(result.success);
    assert.strictEqual(result.item.Descripcion, customDesc);
    assert.strictEqual(result.item.Stock_Fisico, 4);

    // Verify saved file
    const loaded = inventoryService.getInventoryRaw(testInvId);
    assert.ok(loaded);
    const itemInDb = loaded.items.find(it => it.SKU === 'SKU-ALT-24V');
    assert.ok(itemInDb);
    assert.strictEqual(itemInDb.Descripcion, customDesc);
  });

  t.after(() => {
    try {
      const storagePath = require('../src/services/storagePath');
      storagePath.deleteFile(path.join(storagePath.getInventoriesDirectory(), 'INV-BARRIDO-TEST-E2E.json'));
    } catch (e) {}
  });
});
