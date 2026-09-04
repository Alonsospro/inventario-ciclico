const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const app = require('../server');
const storagePath = require('../src/services/storagePath');

test('Reference Photos Lookup By SKU Filename', async (t) => {
  let server;
  let baseUrl;
  const refDir = storagePath.getReferencePhotosDirectory();
  if (!fs.existsSync(refDir)) {
    fs.mkdirSync(refDir, { recursive: true });
  }

  // Dummy 1-pixel / minimal valid JPEG buffer
  const sampleJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xDB]);

  // Create mock SKU image file
  const testSkuFile = path.join(refDir, 'JD_15952.jpg');
  fs.writeFileSync(testSkuFile, sampleJpeg);

  await t.test('Setup test server', async () => {
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        resolve();
      });
    });
  });

  await t.test('Fetch reference photo by exact SKU filename', async () => {
    const res = await fetch(`${baseUrl}/photos/reference/JD_15952`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
  });

  await t.test('Fetch reference photo by stripped SKU (without prefix)', async () => {
    const res = await fetch(`${baseUrl}/photos/reference/15952`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/jpeg');
  });

  await t.test('Fallback to dynamic SVG when SKU image does not exist', async () => {
    const res = await fetch(`${baseUrl}/photos/reference/SKU_INEXISTENTE_9999`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('svg'));
  });

  t.after(async () => {
    if (fs.existsSync(testSkuFile)) {
      try { fs.unlinkSync(testSkuFile); } catch (e) {}
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
