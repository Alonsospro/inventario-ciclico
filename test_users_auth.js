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

const TEST_USERS = [
  { usuario: 'JHAMIL', pass: 'JHD', nombreEsperado: 'JHAMIL CADIMA' },
  { usuario: 'ERICK', pass: 'ROCA', nombreEsperado: 'ERICK MORALES' },
  { usuario: 'FERNANDO', pass: 'CEPI', nombreEsperado: 'FERNANDO PINTO' },
  { usuario: 'JOSE', pass: 'JSM', nombreEsperado: 'JOSE MANUEL' },
  { usuario: 'SAMIR', pass: 'TURCO', nombreEsperado: 'SAMIR' },
  { usuario: 'JORGE', pass: 'BIGOTE', nombreEsperado: 'JORGE RIOS' },
  { usuario: 'ALONSO', pass: 'POTER', nombreEsperado: 'ALONSO RIOS' },
  { usuario: 'GERMAN', pass: 'NOCHI', nombreEsperado: 'GERMAN MENDEZ' },
  { usuario: 'ALONSO', pass: 'ADM', nombreEsperado: 'ALONSO' }
];

async function runAuthTests() {
  console.log('=== TEST SUITE: AUTENTICACIÓN Y GESTIÓN DE USUARIOS CENTRO 1300 ===\n');

  // Test 1: Users list
  console.log('[TEST 1] Consultando lista pública de operadores (/api/auth/users)...');
  const listRes = await request('http://localhost:3000/api/auth/users');
  if (listRes.status !== 200 || !listRes.data.success) {
    throw new Error('Fallo al obtener usuarios: ' + JSON.stringify(listRes));
  }
  console.log(`✓ Se recuperaron ${listRes.data.users.length} operadores activos del Centro 1300.`);
  
  // Test 2: Login for each operator
  console.log('\n[TEST 2] Probando inicio de sesión para cada uno de los 8 operadores + admin...');
  for (const item of TEST_USERS) {
    const res = await request('http://localhost:3000/api/auth/login', { method: 'POST' }, {
      username: item.usuario,
      password: item.pass
    });

    if (res.status === 200 && res.data.success && res.data.user) {
      console.log(`  ✓ Login exitoso: [${item.usuario}] -> ${res.data.user.nombre} (${res.data.user.cargo}, Centro: ${res.data.user.centro})`);
    } else {
      console.error(`  ✗ Error en login para ${item.usuario}:`, res);
      throw new Error(`Login falló para ${item.usuario}`);
    }
  }

  // Test 3: Invalid password
  console.log('\n[TEST 3] Probando caso de contraseña incorrecta...');
  const invalidRes = await request('http://localhost:3000/api/auth/login', { method: 'POST' }, {
    username: 'JHAMIL',
    password: 'PASSWORD_INCORRECTA'
  });
  if (invalidRes.status === 401 && !invalidRes.data.success) {
    console.log('  ✓ Rechazado correctamente con código 401:', invalidRes.data.error);
  } else {
    throw new Error('Debió fallar con contraseña incorrecta');
  }

  // Test 4: Inventory Count with operator JHAMIL CADIMA
  console.log('\n[TEST 4] Registrando conteo en Excel con operador JHAMIL CADIMA...');
  const invRes = await request('http://localhost:3000/api/inventory?userCargo=ENCARGADO&centro=1300');
  const testSku = (invRes.data && invRes.data.items && invRes.data.items.length > 0) ? invRes.data.items[0].sku : 'SKU-1001';
  
  const countRes = await request('http://localhost:3000/api/inventory/count', { method: 'POST' }, {
    sku: testSku,
    physicalStock: 15,
    operatorName: 'JHAMIL CADIMA',
    notes: 'Conteo verificado en turno mañana'
  });
  if (countRes.status === 200 && countRes.data.success) {
    console.log(`  ✓ Conteo guardado en Excel para SKU "${testSku}". Responsable asignado: ${countRes.data.counterName}`);
  } else {
    throw new Error('Fallo al registrar conteo: ' + JSON.stringify(countRes));
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE AUTENTICACIÓN Y USUARIOS PASARON EXITOSAMENTE!');
}

runAuthTests().catch(err => {
  console.error('Error durante las pruebas:', err);
  process.exit(1);
});
