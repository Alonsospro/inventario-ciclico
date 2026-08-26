/**
 * Automated Verification Suite for Multi-Inventory Task Cards & Sheet Connections
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const configService = require('./services/configService');
const assignmentService = require('./services/assignmentService');
const excelService = require('./services/excelService');

async function runTests() {
  console.log('--- INICIANDO TEST SUITE MULTI-INVENTARIO ---');

  // 1. Test Config Service Multi-Inventory Types
  console.log('\n[1] Verificando Tipos de Inventarios en ConfigService...');
  const types = configService.getAllInventoryTypes();
  assert.strictEqual(types.length, 4, 'Deben existir 4 tipos de inventario');
  const typeIds = types.map(t => t.id);
  assert.deepStrictEqual(typeIds, ['ciclico', 'semanal', 'mensual', 'barrido'], 'Los 4 tipos deben coincidir');
  
  const ciclicoMeta = configService.getInventoryTypeMeta('ciclico');
  assert.strictEqual(ciclicoMeta.fileTitle, 'CICLICOS NIBOL MULTIMARCAS');
  
  const semanalMeta = configService.getInventoryTypeMeta('semanal');
  assert.strictEqual(semanalMeta.fileTitle, 'SEMANALES NIBOL MULTIMARCAS');
  
  const mensualMeta = configService.getInventoryTypeMeta('mensual');
  assert.strictEqual(mensualMeta.fileTitle, 'MENSUALES NIBOL MULTIMARCAS');
  
  const barridoMeta = configService.getInventoryTypeMeta('barrido');
  assert.strictEqual(barridoMeta.fileTitle, 'BARRIDO NIBOL MULTIMARCAS');
  console.log('✓ ConfigService metadata verificado correctamente.');

  // 2. Test Assignment Isolation Across Types
  console.log('\n[2] Verificando Aislamiento de Asignaciones por Tipo...');
  const centro = '1300';
  
  // Assign Auxiliar 1 to ciclico
  assignmentService.assignCycle(centro, {
    assignedToUserId: 'user-aux-1',
    assignedToUserName: 'ERICK MORALES',
    assignedToUserLogin: 'ERICK',
    assignedByUserName: 'JAVIER',
    assignedByUserRole: 'ENCARGADO',
    assignedByUserCentro: '1300',
    notes: 'Conteo diario cíclico',
    inventoryType: 'ciclico'
  });

  // Assign Auxiliar 2 to semanal
  assignmentService.assignCycle(centro, {
    assignedToUserId: 'user-aux-2',
    assignedToUserName: 'CARLOS PEREZ',
    assignedToUserLogin: 'CARLOS',
    assignedByUserName: 'JAVIER',
    assignedByUserRole: 'ENCARGADO',
    assignedByUserCentro: '1300',
    notes: 'Conteo semanal pasillo B',
    inventoryType: 'semanal'
  });

  const asgCiclico = assignmentService.getAssignment(centro, 'ciclico');
  assert.strictEqual(asgCiclico.assignedToUserName, 'ERICK MORALES');
  assert.strictEqual(asgCiclico.inventoryType, 'ciclico');

  const asgSemanal = assignmentService.getAssignment(centro, 'semanal');
  assert.strictEqual(asgSemanal.assignedToUserName, 'CARLOS PEREZ');
  assert.strictEqual(asgSemanal.inventoryType, 'semanal');

  const asgMensual = assignmentService.getAssignment(centro, 'mensual');
  assert.strictEqual(asgMensual.status, 'NO_ASIGNADO');

  console.log('✓ Las asignaciones se mantienen aisladas independientemente por tipo.');

  // 3. Test History Filtering by Inventory Type
  console.log('\n[3] Verificando Historial Filtrado por Tipo...');
  const historyCiclico = assignmentService.getHistory({ centro, inventoryType: 'ciclico' });
  assert(historyCiclico.some(h => h.assignedToUserName === 'ERICK MORALES'));
  
  const historySemanal = assignmentService.getHistory({ centro, inventoryType: 'semanal' });
  assert(historySemanal.some(h => h.assignedToUserName === 'CARLOS PEREZ'));
  console.log('✓ Historial filtrado correctamente.');

  // 4. Test Conclude & Digital Signature for Specific Type
  console.log('\n[4] Verificando Conclusión y Firma para Inventario Semanal...');
  const concludeRes = await assignmentService.concludeAndSignCycle(centro, {
    signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    operatorName: 'CARLOS PEREZ',
    operatorRole: 'AUXILIAR',
    notes: 'Conteo semanal completado',
    inventoryType: 'semanal'
  });
  assert.strictEqual(concludeRes.status, 'CONCLUIDO');
  assert.strictEqual(concludeRes.historyEntry.status, 'CONCLUIDO');
  
  const asgSemanalAfter = assignmentService.getAssignment(centro, 'semanal');
  assert.strictEqual(asgSemanalAfter.status, 'NO_ASIGNADO', 'Tras concluir, la orden activa se reinicia a NO_ASIGNADO');
  
  // Ciclico must remain ASIGNADO
  const asgCiclicoAfter = assignmentService.getAssignment(centro, 'ciclico');
  assert.strictEqual(asgCiclicoAfter.status, 'ASIGNADO');
  console.log('✓ Conclusión firmada afecta solo al tipo correspondiente sin interferir con otros.');

  // 5. Test Deletion and Restoration of Completed Cycle
  console.log('\n[5] Verificando Borrado de Ciclo Semanal...');
  const delRes = await assignmentService.deleteCycle(centro, concludeRes.historyEntry.cycleId, {
    username: 'ALONSO',
    password: 'ADM'
  });
  assert(delRes.success, 'Borrado debe ser exitoso');

  const asgSemanalReset = assignmentService.getAssignment(centro, 'semanal');
  assert.strictEqual(asgSemanalReset.status, 'NO_ASIGNADO');
  console.log('✓ Borrado y reseteo de tarea completado con éxito.');

  // 6. Test App Script files existence
  console.log('\n[6] Verificando Archivos Google Apps Script...');
  const files = [
    'Code_CICLICOS.gs',
    'Code_SEMANALES.gs',
    'Code_MENSUALES.gs',
    'Code_BARRIDO.gs'
  ];
  for (const f of files) {
    const p = path.join(__dirname, 'google_apps_script', f);
    assert(fs.existsSync(p), `El archivo ${f} debe existir`);
  }
  console.log('✓ Los 4 archivos Google Apps Script existen y están listos.');

  console.log('\n======================================================');
  console.log('🎉 TODOS LOS TESTS DE MULTI-INVENTARIOS PASARON (100%)');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('❌ Error en tests:', err);
  process.exit(1);
});
