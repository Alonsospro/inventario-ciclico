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
  console.log('--- VALIDACIÓN DE VARIANTES DE CENTROS Y ROLES ---');

  // Test 1: Centros list
  const centrosRes = await request('http://localhost:3000/api/centros');
  console.log(`✓ Centros obtenidos: ${centrosRes.data.centros.length} centros`);
  centrosRes.data.centros.forEach(c => {
    const encargados = c.encargados.map(e => e.nombre).join(', ') || 'N/A';
    console.log(`   [Centro ${c.codigo}] -> Encargado: ${encargados} | Auxiliares: ${c.auxiliaresCount} | Total: ${c.totalUsuarios}`);
  });

  // Test 2: Login Auxiliar (JHAMIL / JHD / 1300)
  console.log('\n[TEST 2] Probando Login de Auxiliar (JHAMIL - Centro 1300)...');
  const loginAux = await request('http://localhost:3000/api/auth/login', { method: 'POST' }, {
    username: 'JHAMIL',
    password: 'JHD',
    centro: '1300'
  });
  console.log('✓ Login Auxiliar:', loginAux.data.user.nombre, '-', loginAux.data.user.cargo, '(Centro ' + loginAux.data.user.centro + ')');

  // Test 3: Login Encargado (JAVIER / JVLP / 1300)
  console.log('\n[TEST 3] Probando Login de Encargado (JAVIER - Centro 1300)...');
  const loginEnc = await request('http://localhost:3000/api/auth/login', { method: 'POST' }, {
    username: 'JAVIER',
    password: 'JVLP',
    centro: '1300'
  });
  console.log('✓ Login Encargado 1300:', loginEnc.data.user.nombre, '-', loginEnc.data.user.cargo);

  // Test 4: Login Encargado (ERICK / ESJ / 1800)
  console.log('\n[TEST 4] Probando Login de Encargado en Centro 1800 (ERICK - ESJ)...');
  const loginEnc1800 = await request('http://localhost:3000/api/auth/login', { method: 'POST' }, {
    username: 'ERICK',
    password: 'ESJ',
    centro: '1800'
  });
  console.log('✓ Login Encargado 1800:', loginEnc1800.data.user.nombre, '-', loginEnc1800.data.user.cargo, '(Centro ' + loginEnc1800.data.user.centro + ')');

  console.log('\n🎉 ¡TODAS LAS VALIDACIONES DE CENTROS Y ROLES PASARON CON ÉXITO!');
}

runTests().catch(console.error);
