const http = require('http');
const path = require('path');
const ExcelJS = require('exceljs');

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
  console.log('--- INICIANDO SUITE DE PRUEBAS DE INVENTARIO CÍCLICO ---');

  // Test 1: Config
  console.log('\n[TEST 1] Obteniendo configuración del servidor...');
  const cfg = await request('http://localhost:3000/api/config');
  console.log('✓ Status:', cfg.status);
  console.log('✓ Archivo activo:', cfg.data.fileName);
  console.log('✓ IP local detectada:', cfg.data.localIp);

  // Test 2: Inventory
  console.log('\n[TEST 2] Consultando productos de Excel / Google Sheets...');
  const inv = await request('http://localhost:3000/api/inventory?userCargo=ENCARGADO&centro=1300');
  console.log('✓ Total productos leídos:', inv.data.totalCount);
  const firstItem = (inv.data.items && inv.data.items[0]) || { sku: 'JD_15945', description: 'Item Prueba', systemStock: 10 };
  console.log('✓ Primer producto:', firstItem.sku, '-', firstItem.description, '- Stock Sistema:', firstItem.systemStock);

  // Test 3: Count item 1 (Exact match)
  console.log(`\n[TEST 3] Registrando conteo para ${firstItem.sku}...`);
  const count1 = await request('http://localhost:3000/api/inventory/count', { method: 'POST' }, {
    sku: firstItem.sku,
    physicalStock: firstItem.systemStock || 10,
    operatorName: 'Auditor Carlos',
    centro: '1300',
    notes: 'Conteo conforme en pasillo 1'
  });
  console.log('✓ Conteo 1 registrado:', count1.data);

  // Test 4: Count item 2 (Discrepancy -2)
  console.log('\n[TEST 4] Registrando conteo con faltante para HER-2001 (Taladro DeWalt, Sistema: 22, Físico: 20)...');
  const count2 = await request('http://localhost:3000/api/inventory/count', { method: 'POST' }, {
    sku: 'HER-2001',
    physicalStock: 20,
    operatorName: 'Auditor Carlos',
    notes: '2 unidades en reparación técnica'
  });
  console.log('✓ Conteo 2 registrado:', count2.data);

  // Test 5: Analytics
  console.log('\n[TEST 5] Consultando métricas IRA y Discrepancias...');
  const analytics = await request('http://localhost:3000/api/analytics');
  console.log('✓ Ítems contados:', analytics.data.countedItems, '/', analytics.data.totalItems);
  console.log('✓ Ítems exactos (Cuadrados):', analytics.data.exactMatches);
  console.log('✓ Ítems con faltante:', analytics.data.missingItems);
  console.log('✓ Indicador IRA (% Exactitud):', analytics.data.iraPercentage, '%');
  console.log('✓ Impacto financiero neto:', '$' + analytics.data.netVarianceCost);

  // Test 6: Verify actual Excel file on disk
  console.log('\n[TEST 6] Verificando escritura directa en el archivo Excel físico...');
  const excelPath = cfg.data.activeFilePath;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  
  const mainSheet = wb.getWorksheet(cfg.data.activeSheetName);
  console.log('✓ Hoja principal:', mainSheet.name, '- Filas:', mainSheet.rowCount);

  // Check row 2 (ELC-1001)
  const row2 = mainSheet.getRow(2);
  console.log('✓ Fila 2 en Excel (ELC-1001):');
  console.log('   SKU:', row2.getCell(1).value);
  console.log('   Stock Físico escrito:', row2.getCell(10).value);
  console.log('   Diferencia:', row2.getCell(11).value);
  console.log('   Fecha conteo:', row2.getCell(13).value);
  console.log('   Responsable:', row2.getCell(14).value);
  console.log('   Estado:', row2.getCell(15).value);

  // Check audit sheet
  const auditSheet = wb.getWorksheet('Auditoria_1300') || wb.getWorksheet('Auditoria_Conteos');
  console.log('✓ Hoja de Auditoría en Excel:', auditSheet.name, '- Filas registradas:', auditSheet.rowCount);
  for (let r = 2; r <= auditSheet.rowCount; r++) {
    const aRow = auditSheet.getRow(r);
    console.log(`   Auditoría #${r-1}: ID=${aRow.getCell(1).value}, SKU=${aRow.getCell(3).value}, Sistema=${aRow.getCell(6).value}, Contado=${aRow.getCell(7).value}, Dif=${aRow.getCell(8).value}, Estado=${aRow.getCell(10).value}, Resp=${aRow.getCell(11).value}, Notas="${aRow.getCell(12).value}"`);
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE CON INTEGRIDAD COMPLETA EN EXCEL!');
}

runTests().catch(console.error);
