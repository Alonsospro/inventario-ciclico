const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const gasService = require('../src/services/gasService');

test('Google Sheets 17 Columns Mapping Contract (A to Q)', (t) => {
  const expectedCols = [
    'SKU',                // A
    'Codigo_Barras',      // B
    'Descripcion',        // C
    'Ubicacion',          // D
    'Categoria',          // E
    'Clasificacion_ABC',  // F
    'Unidad',             // G
    'Costo_Unitario',     // H
    'Stock_Sistema',      // I
    'Stock_Fisico',       // J
    'Diferencia',         // K
    'Costo_Diferencia',   // L
    'Fecha_Ultimo_Conteo',// M
    'Responsable',        // N
    'Estado',             // O
    'Mal_estado',         // P
    'Comentario'          // Q
  ];

  assert.deepStrictEqual(config.columns, expectedCols, 'Config columns must match exactly A to Q contract');

  // Test array-based row mapping
  const sampleArrayRow = [
    'JD_15952',     // A: SKU
    '15945',        // B: Codigo_Barras
    'Disco Freno',  // C: Descripcion
    'A102006B8A',   // D: Ubicacion
    'REPUESTOS',    // E: Categoria
    'A',            // F: Clasificacion_ABC
    'PZA',          // G: Unidad
    120.5,          // H: Costo_Unitario
    15,             // I: Stock_Sistema
    14,             // J: Stock_Fisico
    -1,             // K: Diferencia
    -120.5,         // L: Costo_Diferencia
    '2026-09-01',   // M: Fecha_Ultimo_Conteo
    'Wenderson',    // N: Responsable
    'Contado',      // O: Estado
    2,              // P: Mal_estado
    'Caja golpeada' // Q: Comentario
  ];

  const mapped = gasService.mapRawRowsToColumns([sampleArrayRow]);
  assert.strictEqual(mapped.length, 1);
  const item = mapped[0];

  assert.strictEqual(item.SKU, 'JD_15952');
  assert.strictEqual(item.Codigo_Barras, '15945');
  assert.strictEqual(item.Descripcion, 'Disco Freno');
  assert.strictEqual(item.Ubicacion, 'A102006B8A');
  assert.strictEqual(item.Categoria, 'REPUESTOS');
  assert.strictEqual(item.Clasificacion_ABC, 'A');
  assert.strictEqual(item.Unidad, 'PZA');
  assert.strictEqual(item.Costo_Unitario, 120.5);
  assert.strictEqual(item.Stock_Sistema, 15);
  assert.strictEqual(item.Stock_Fisico, 14);
  assert.strictEqual(item.Diferencia, -1);
  assert.strictEqual(item.Costo_Diferencia, -120.5);
  assert.strictEqual(item.Fecha_Ultimo_Conteo, '2026-09-01');
  assert.strictEqual(item.Responsable, 'Wenderson');
  assert.strictEqual(item.Estado, 'Contado');
  assert.strictEqual(item.Mal_estado, 2);
  assert.strictEqual(item.Comentario, 'Caja golpeada');
});
