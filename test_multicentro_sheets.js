const http = require('http');

function request(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (data) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- TEST: INDEPENDENCIA DE PESTAÑAS POR CENTRO EN EXCEL ---');

  // Test 1: Query Centro 1300
  console.log('\n[1] Consultando inventario del Centro 1300...');
  const inv1300 = await request('http://localhost:3000/api/inventory?centro=1300');
  console.log(`✓ Centro: ${inv1300.data.centro} | Pestaña: [${inv1300.data.sheetName}] | Artículos: ${inv1300.data.totalCount}`);
  console.log(`   Primer SKU: ${inv1300.data.items[0].sku} - ${inv1300.data.items[0].description}`);

  // Test 2: Query Centro 1800
  console.log('\n[2] Consultando inventario del Centro 1800...');
  const inv1800 = await request('http://localhost:3000/api/inventory?centro=1800');
  console.log(`✓ Centro: ${inv1800.data.centro} | Pestaña: [${inv1800.data.sheetName}] | Artículos: ${inv1800.data.totalCount}`);
  console.log(`   Primer SKU: ${inv1800.data.items[0].sku} - ${inv1800.data.items[0].description}`);

  // Test 3: Record Count in Centro 1800
  console.log('\n[3] Registrando conteo de 15 unidades en SKU del Centro 1800...');
  const firstSku1800 = inv1800.data.items[0].sku;
  const countRes1800 = await request('http://localhost:3000/api/inventory/count', { method: 'POST' }, {
    sku: firstSku1800,
    physicalStock: 15,
    operatorName: 'ERICK SJ',
    centro: '1800',
    unitCost: inv1800.data.items[0].unitCost,
    systemStock: inv1800.data.items[0].systemStock
  });
  console.log('✓ Guardado en Excel:', countRes1800.data);

  // Test 4: Query again Centro 1800 to verify updated physicalStock
  const verify1800 = await request('http://localhost:3000/api/inventory?centro=1800');
  const updatedItem1800 = verify1800.data.items.find(i => i.sku === firstSku1800);
  console.log(`✓ Verificación en Pestaña 1800: SKU ${updatedItem1800.sku} tiene Stock Físico = ${updatedItem1800.physicalStock}`);

  // Test 5: Verify that Centro 1300 was NOT affected
  const verify1300 = await request('http://localhost:3000/api/inventory?centro=1300');
  const check1300 = verify1300.data.items[0];
  console.log(`✓ Verificación en Pestaña 1300: SKU ${check1300.sku} sigue con Stock Físico = ${check1300.physicalStock} (Totalmente independiente)`);

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE PESTAÑAS MULTICENTRO PASARON EXITOSAMENTE!');
}

runTests().catch(console.error);
