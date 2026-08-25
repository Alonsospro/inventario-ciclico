/**
 * ============================================================================
 * CYCLICSTOCK PRO - GOOGLE APPS SCRIPT BACKEND (SINCRONIZACIÓN EN TIEMPO REAL)
 * ============================================================================
 * Este script convierte tu Google Spreadsheet en una API REST en la nube 24/7.
 * Permite que la aplicación web (en Vercel o local) lea y escriba datos directamente
 * en las hojas de los 13 Centros y en la hoja de Auditoría en tiempo real.
 * 
 * Columnas estándar esperadas en cada hoja de Centro:
 * Col A (1): SKU
 * Col B (2): Codigo_Barras
 * Col C (3): Descripcion
 * Col D (4): Ubicacion
 * Col E (5): Categoria
 * Col F (6): Clasificacion_ABC
 * Col G (7): Unidad
 * Col H (8): Costo_Unitario
 * Col I (9): Stock_Sistema
 * Col J (10): Stock_Fisico
 * Col K (11): Diferencia
 * Col L (12): Costo_Diferencia
 * Col M (13): Fecha_Ultimo_Conteo
 * Col N (14): Responsable
 * Col O (15): Estado
 */

// ----------------------------------------------------------------------------
// Manejador GET: Consultas de Inventario, Hojas y Métricas
// ----------------------------------------------------------------------------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  var centro = (e && e.parameter && e.parameter.centro) || (e && e.parameter && e.parameter.sheet) || '1300';
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'Google Apps Script Online - CyclicStock PRO',
        spreadsheetName: ss.getName(),
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'getSheets') {
      var sheets = ss.getSheets().map(function(s) {
        return {
          name: s.getName(),
          rowCount: Math.max(0, s.getLastRow() - 1)
        };
      });
      return jsonResponse({ success: true, sheets: sheets });
    }
    
    if (action === 'getInventory') {
      var targetSheet = findSheetByCentro(ss, centro);
      if (!targetSheet) {
        return jsonResponse({
          success: false,
          error: 'No se encontró la hoja para el centro: ' + centro
        });
      }
      
      var inventoryData = readInventoryFromSheet(targetSheet, centro);
      return jsonResponse({
        success: true,
        centro: String(centro),
        sheetName: targetSheet.getName(),
        items: inventoryData.items,
        totalItems: inventoryData.items.length,
        countedCount: inventoryData.countedCount,
        pendingCount: inventoryData.pendingCount
      });
    }
    
    if (action === 'getAnalytics') {
      var targetSheet = findSheetByCentro(ss, centro);
      if (!targetSheet) {
        return jsonResponse({ success: false, error: 'Hoja no encontrada para centro: ' + centro });
      }
      var analytics = calculateAnalyticsFromSheet(targetSheet, centro);
      return jsonResponse({ success: true, centro: String(centro), ...analytics });
    }
    
    return jsonResponse({ success: false, error: 'Acción no soportada: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ----------------------------------------------------------------------------
// Manejador POST: Actualización de Conteos, Reinicio de Ciclos y Auditoría
// ----------------------------------------------------------------------------
function doPost(e) {
  try {
    var rawContents = e.postData.contents;
    var data = JSON.parse(rawContents);
    var action = data.action || 'updateCount';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === 'updateCount') {
      var centro = String(data.centro || '1300');
      var sheet = findSheetByCentro(ss, centro);
      if (!sheet) {
        return jsonResponse({ success: false, error: 'Hoja no encontrada para el centro ' + centro });
      }
      
      var result = updateItemCountInSheet(ss, sheet, data);
      return jsonResponse(result);
    }
    
    if (action === 'resetCycle') {
      var centro = String(data.centro || '1300');
      var sheet = findSheetByCentro(ss, centro);
      if (!sheet) {
        return jsonResponse({ success: false, error: 'Hoja no encontrada para el centro ' + centro });
      }
      
      var resetResult = resetCycleInSheet(sheet, data);
      return jsonResponse(resetResult);
    }
    
    if (action === 'concludeCycle') {
      var recordResult = recordCycleConclusion(ss, data);
      return jsonResponse(recordResult);
    }
    
    return jsonResponse({ success: false, error: 'Acción POST no reconocida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ----------------------------------------------------------------------------
// Funciones Auxiliares de Lectura y Escritura
// ----------------------------------------------------------------------------

function findSheetByCentro(ss, centro) {
  var cStr = String(centro).trim().toLowerCase();
  var sheets = ss.getSheets();
  
  // 1. Coincidencia exacta o contiene el código (ej: '1300', 'Centro 1300', 'C1300')
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName().toLowerCase().trim();
    if (name === cStr || name === 'centro ' + cStr || name === 'c' + cStr || name === 'centro_' + cStr) {
      return sheets[i];
    }
  }
  
  // 2. Coincidencia parcial
  for (var j = 0; j < sheets.length; j++) {
    if (sheets[j].getName().toLowerCase().indexOf(cStr) !== -1) {
      return sheets[j];
    }
  }
  
  // 3. Fallback a la primera hoja si no coincide
  return sheets[0] || null;
}

function readInventoryFromSheet(sheet, centro) {
  var lastRow = sheet.getLastRow();
  var items = [];
  var countedCount = 0;
  var pendingCount = 0;
  
  if (lastRow <= 1) {
    return { items: [], countedCount: 0, pendingCount: 0 };
  }
  
  var values = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var sku = String(row[0] || '').trim();
    if (!sku) continue; // Fila vacía
    
    var barcode = String(row[1] || '').trim();
    var description = String(row[2] || '').trim();
    var location = String(row[3] || '').trim();
    var category = String(row[4] || '').trim();
    var abcClass = String(row[5] || 'C').trim().toUpperCase();
    var unit = String(row[6] || 'UND').trim();
    var unitCost = parseFloat(row[7]) || 0;
    var systemStock = parseFloat(row[8]) || 0;
    
    var rawPhysical = row[9];
    var physicalStock = (rawPhysical !== '' && rawPhysical !== null && !isNaN(rawPhysical)) ? parseFloat(rawPhysical) : null;
    var variance = (physicalStock !== null) ? (physicalStock - systemStock) : null;
    var varianceCost = (variance !== null) ? (variance * unitCost) : null;
    
    var lastCountDate = row[12] ? (row[12] instanceof Date ? Utilities.formatDate(row[12], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(row[12])) : null;
    var counterName = String(row[13] || '').trim();
    var status = String(row[14] || '').trim().toUpperCase();
    
    if (!status) {
      if (physicalStock !== null) {
        status = (variance === 0) ? 'SIN_DIFERENCIA' : 'CON_DIFERENCIA';
      } else {
        status = 'PENDIENTE';
      }
    }
    
    if (status === 'PENDIENTE') {
      pendingCount++;
    } else {
      countedCount++;
    }
    
    items.push({
      rowIndex: i + 2,
      sku: sku,
      barcode: barcode,
      description: description,
      location: location,
      category: category,
      abcClass: abcClass,
      unit: unit,
      unitCost: unitCost,
      systemStock: systemStock,
      physicalStock: physicalStock,
      variance: variance,
      varianceCost: varianceCost,
      lastCountDate: lastCountDate,
      counterName: counterName,
      status: status,
      centro: String(centro)
    });
  }
  
  return { items: items, countedCount: countedCount, pendingCount: pendingCount };
}

function updateItemCountInSheet(ss, sheet, data) {
  var skuTarget = String(data.sku || '').trim().toLowerCase();
  var lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return { success: false, error: 'La hoja de inventario no contiene filas de datos.' };
  }
  
  var skuRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRow = -1;
  
  for (var i = 0; i < skuRange.length; i++) {
    if (String(skuRange[i][0] || '').trim().toLowerCase() === skuTarget) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow === -1) {
    return { success: false, error: 'No se encontró el SKU ' + data.sku + ' en la hoja ' + sheet.getName() };
  }
  
  var rowData = sheet.getRange(targetRow, 1, 1, 15).getValues()[0];
  var description = String(rowData[2] || '');
  var location = String(rowData[3] || '');
  var unitCost = parseFloat(rowData[7]) || 0;
  var systemStock = parseFloat(rowData[8]) || 0;
  
  var physicalStock = parseFloat(data.physicalStock);
  if (isNaN(physicalStock) || physicalStock < 0) {
    physicalStock = 0;
  }
  
  var variance = physicalStock - systemStock;
  var varianceCost = variance * unitCost;
  var now = new Date();
  var timestampStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var counterName = data.counterName || data.operatorName || 'Auxiliar';
  var status = (variance === 0) ? 'SIN_DIFERENCIA' : 'CON_DIFERENCIA';
  
  // Actualizar celdas en la hoja del Centro (Cols J, K, L, M, N, O -> 10, 11, 12, 13, 14, 15)
  sheet.getRange(targetRow, 10).setValue(physicalStock);
  sheet.getRange(targetRow, 11).setValue(variance);
  sheet.getRange(targetRow, 12).setValue(varianceCost);
  sheet.getRange(targetRow, 13).setValue(timestampStr);
  sheet.getRange(targetRow, 14).setValue(counterName);
  sheet.getRange(targetRow, 15).setValue(status);
  
  // Registrar en Hoja de Auditoría
  logAuditEntry(ss, {
    timestamp: timestampStr,
    centro: sheet.getName(),
    sku: data.sku,
    description: description,
    location: location,
    unitCost: unitCost,
    systemStock: systemStock,
    physicalStock: physicalStock,
    variance: variance,
    varianceCost: varianceCost,
    counterName: counterName,
    notes: data.notes || ''
  });
  
  return {
    success: true,
    message: 'Conteo guardado exitosamente en Google Sheets',
    updatedItem: {
      sku: data.sku,
      description: description,
      location: location,
      systemStock: systemStock,
      physicalStock: physicalStock,
      variance: variance,
      varianceCost: varianceCost,
      lastCountDate: timestampStr,
      counterName: counterName,
      status: status,
      centro: sheet.getName()
    }
  };
}

function logAuditEntry(ss, auditData) {
  var auditSheet = ss.getSheetByName('Auditoría Conteos');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('Auditoría Conteos');
    auditSheet.appendRow([
      'Marca Temporal', 'Centro', 'SKU', 'Descripción', 'Ubicación',
      'Costo Unitario', 'Stock Sistema', 'Stock Físico', 'Diferencia',
      'Costo Diferencia', 'Responsable', 'Observaciones'
    ]);
    auditSheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    auditSheet.setFrozenRows(1);
  }
  
  auditSheet.appendRow([
    auditData.timestamp,
    auditData.centro,
    auditData.sku,
    auditData.description,
    auditData.location,
    auditData.unitCost,
    auditData.systemStock,
    auditData.physicalStock,
    auditData.variance,
    auditData.varianceCost,
    auditData.counterName,
    auditData.notes
  ]);
}

function resetCycleInSheet(sheet, filter) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: true, count: 0 };
  
  var locFilter = (filter.location || '').trim().toLowerCase();
  var abcFilter = (filter.abcClass || '').trim().toUpperCase();
  var values = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  var resetCount = 0;
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var rowLoc = String(row[3] || '').trim().toLowerCase();
    var rowAbc = String(row[5] || '').trim().toUpperCase();
    
    var matchLoc = !locFilter || (rowLoc === locFilter);
    var matchAbc = !abcFilter || (rowAbc === abcFilter);
    
    if (matchLoc && matchAbc) {
      var r = i + 2;
      sheet.getRange(r, 10).setValue(''); // Stock Físico
      sheet.getRange(r, 11).setValue(''); // Diferencia
      sheet.getRange(r, 12).setValue(''); // Costo Diferencia
      sheet.getRange(r, 13).setValue(''); // Fecha
      sheet.getRange(r, 14).setValue(''); // Responsable
      sheet.getRange(r, 15).setValue('PENDIENTE'); // Estado
      resetCount++;
    }
  }
  
  return { success: true, message: 'Ciclo reiniciado para ' + resetCount + ' artículos', resetCount: resetCount };
}

function calculateAnalyticsFromSheet(sheet, centro) {
  var inv = readInventoryFromSheet(sheet, centro);
  var items = inv.items;
  
  var totalItems = items.length;
  var countedCount = 0;
  var pendingCount = 0;
  var withVarianceCount = 0;
  var withoutVarianceCount = 0;
  var totalSystemValue = 0;
  var totalCountedValue = 0;
  var netVarianceValue = 0;
  var absoluteVarianceValue = 0;
  
  var abcBreakdown = {
    A: { total: 0, counted: 0, exact: 0, variance: 0 },
    B: { total: 0, counted: 0, exact: 0, variance: 0 },
    C: { total: 0, counted: 0, exact: 0, variance: 0 }
  };
  
  var variancesList = [];
  
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var abc = it.abcClass || 'C';
    if (!abcBreakdown[abc]) abcBreakdown[abc] = { total: 0, counted: 0, exact: 0, variance: 0 };
    abcBreakdown[abc].total++;
    
    totalSystemValue += (it.systemStock * it.unitCost);
    
    if (it.physicalStock !== null && it.status !== 'PENDIENTE') {
      countedCount++;
      abcBreakdown[abc].counted++;
      totalCountedValue += (it.physicalStock * it.unitCost);
      
      var diff = it.variance || 0;
      var diffCost = it.varianceCost || 0;
      netVarianceValue += diffCost;
      absoluteVarianceValue += Math.abs(diffCost);
      
      if (diff === 0) {
        withoutVarianceCount++;
        abcBreakdown[abc].exact++;
      } else {
        withVarianceCount++;
        abcBreakdown[abc].variance++;
        variancesList.push({
          sku: it.sku,
          description: it.description,
          location: it.location,
          abcClass: it.abcClass,
          systemStock: it.systemStock,
          physicalStock: it.physicalStock,
          variance: diff,
          varianceCost: diffCost,
          counterName: it.counterName,
          lastCountDate: it.lastCountDate
        });
      }
    } else {
      pendingCount++;
    }
  }
  
  var iraPercent = countedCount > 0 ? ((withoutVarianceCount / countedCount) * 100).toFixed(1) : '100.0';
  var progressPercent = totalItems > 0 ? ((countedCount / totalItems) * 100).toFixed(1) : '0.0';
  
  // Ordenar variaciones por impacto monetario absoluto
  variancesList.sort(function(a, b) {
    return Math.abs(b.varianceCost) - Math.abs(a.varianceCost);
  });
  
  return {
    totalItems: totalItems,
    countedCount: countedCount,
    pendingCount: pendingCount,
    withVarianceCount: withVarianceCount,
    withoutVarianceCount: withoutVarianceCount,
    iraPercent: parseFloat(iraPercent),
    progressPercent: parseFloat(progressPercent),
    totalSystemValue: Math.round(totalSystemValue * 100) / 100,
    totalCountedValue: Math.round(totalCountedValue * 100) / 100,
    netVarianceValue: Math.round(netVarianceValue * 100) / 100,
    absoluteVarianceValue: Math.round(absoluteVarianceValue * 100) / 100,
    abcBreakdown: abcBreakdown,
    topVariances: variancesList.slice(0, 15)
  };
}

function recordCycleConclusion(ss, data) {
  var logSheet = ss.getSheetByName('Cierres de Ciclos');
  if (!logSheet) {
    logSheet = ss.insertSheet('Cierres de Ciclos');
    logSheet.appendRow(['Fecha Cierre', 'Centro', 'Responsable', 'Cargo', 'Total Artículos', 'Exactitud IRA %', 'Notas']);
    logSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  }
  
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  logSheet.appendRow([
    nowStr,
    data.centro || '1300',
    data.operatorName || 'Operador',
    data.operatorCargo || 'AUXILIAR',
    data.totalCounted || 0,
    data.iraPercent || 100,
    data.notes || ''
  ]);
  
  return { success: true, message: 'Cierre registrado correctamente en Google Sheets' };
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
