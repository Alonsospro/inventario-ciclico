/**
 * ============================================================================
 * SCRIPT 1: CICLICOS NIBOL MULTIMARCAS
 * CyclicStock PRO - Google Apps Script Connector (Inventario Cíclico Diario/Rotativo)
 * ============================================================================
 * Archivo en Google Drive: "CICLICOS NIBOL MULTIMARCAS" (Carpeta Nibol/ciclicos)
 * 
 * Columnas estándar esperadas en cada hoja de Centro (1300, 1800, etc.):
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
 * Col P (16): Mal_Estado
 */

var INVENTORY_TYPE_NAME = "INVENTARIO CÍCLICO";
var INVENTORY_FILE_NAME = "CICLICOS NIBOL MULTIMARCAS";

// ----------------------------------------------------------------------------
// Manejador GET: Consultas de Inventario Cíclico, Hojas y Métricas
// ----------------------------------------------------------------------------
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  var centro = (e && e.parameter && e.parameter.centro) || (e && e.parameter && e.parameter.sheet) || '1300';
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === 'ping') {
      return jsonResponse({
        success: true,
        message: 'Google Apps Script Online - ' + INVENTORY_TYPE_NAME,
        inventoryType: 'ciclico',
        fileTitle: INVENTORY_FILE_NAME,
        spreadsheetName: ss.getName(),
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'getSheets') {
      var sheets = ss.getSheets().map(function(s) {
        var sName = s.getName();
        var isAudit = sName.toLowerCase().indexOf('auditor') !== -1 || sName.toLowerCase().indexOf('cierre') !== -1;
        return {
          name: sName,
          rowCount: Math.max(0, s.getLastRow() - 1),
          isAuditSheet: isAudit
        };
      });
      return jsonResponse({ success: true, inventoryType: 'ciclico', sheets: sheets });
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
        inventoryType: 'ciclico',
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
      return jsonResponse({ success: true, inventoryType: 'ciclico', centro: String(centro), ...analytics });
    }
    
    return jsonResponse({ success: false, error: 'Acción no soportada: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ----------------------------------------------------------------------------
// Manejador POST: Actualización de Conteos, Reinicio y Auditoría
// ----------------------------------------------------------------------------
function doPost(e) {
  try {
    var rawContents = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(rawContents);
    var action = data.action || (data.fileIdOriginal ? 'concluirRevision' : 'updateCount');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === 'updateCount') {
      var centro = String(data.centro || '1300');
      var sheet = findSheetByCentro(ss, centro);
      if (!sheet) {
        return jsonResponse({ status: 'error', success: false, error: 'Hoja no encontrada para el centro ' + centro });
      }
      
      var result = updateItemCountInSheet(ss, sheet, data);
      return jsonResponse(result);
    }
    
    if (action === 'resetCycle') {
      var centro = String(data.centro || '1300');
      var sheet = findSheetByCentro(ss, centro);
      if (!sheet) {
        return jsonResponse({ status: 'error', success: false, error: 'Hoja no encontrada para el centro ' + centro });
      }
      
      var resetResult = resetCycleInSheet(sheet, data);
      return jsonResponse(resetResult);
    }
    
    if (action === 'concludeCycle') {
      var recordResult = exportConcludedCycleToDrive(ss, data);
      return jsonResponse(recordResult);
    }

    if (action === 'uploadDamagedPhoto') {
      var uploadResult = saveDamagedPhotoToDrive(data);
      return jsonResponse(uploadResult);
    }

    if (action === 'finishReview' || action === 'concluirRevision') {
      var reviewResult = exportJustifiedCycleToDrive(ss, data);
      return jsonResponse(reviewResult);
    }
    
    return jsonResponse({ status: 'error', success: false, error: 'Acción POST no reconocida: ' + action });
  } catch (err) {
    return jsonResponse({ status: 'error', success: false, error: err.toString(), message: err.toString() });
  }
}

// ----------------------------------------------------------------------------
// Funciones Auxiliares
// ----------------------------------------------------------------------------

function saveDamagedPhotoToDrive(data) {
  var centro = String(data.centro || '1300');
  var dateStr = data.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var cleanCentro = String(data.centro || centro || '1300').replace(/^Centro\s*/i, '').trim();
  var sku = String(data.sku || 'SKU').toUpperCase();
  var timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HHmmss');
  
  var folderPath = 'Nibol/ciclicos/fotos/' + dateStr + '/' + cleanCentro;
  var targetFolder = getOrCreateDriveFolder(folderPath);
  
  var fileName = data.fileName || (cleanCentro + '_' + sku + '_MAL_ESTADO.jpg');
  var fileBase64 = data.fileBase64 || data.base64 || '';
  if (fileBase64.indexOf('base64,') !== -1) {
    fileBase64 = fileBase64.split('base64,')[1];
  }
  
  var mimeType = data.mimeType || 'image/jpeg';
  var decodedBlob = Utilities.newBlob(Utilities.base64Decode(fileBase64), mimeType, fileName);
  var file = targetFolder.createFile(decodedBlob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shErr) {
    Logger.log('Aviso sharing: ' + shErr);
  }
  
  return {
    status: 'success',
    success: true,
    message: 'Foto guardada en Google Drive (' + folderPath + ')',
    fileId: file.getId(),
    fileName: fileName,
    fileUrl: file.getUrl(),
    folderUrl: targetFolder.getUrl()
  };
}

function findSheetByCentro(ss, centro) {
  var cStr = String(centro || '1300').replace(/^Centro\s*/i, '').trim().toLowerCase();
  var sheets = ss.getSheets();
  
  for (var i = 0; i < sheets.length; i++) {
    var rawName = sheets[i].getName().trim();
    var name = rawName.toLowerCase();
    if (name.indexOf('auditor') !== -1 || name.indexOf('cierre') !== -1) continue;
    if (name === cStr || name === 'centro ' + cStr || name === 'c' + cStr || name === 'centro_' + cStr) {
      return sheets[i];
    }
  }
  
  for (var j = 0; j < sheets.length; j++) {
    var rawName = sheets[j].getName().trim();
    var name = rawName.toLowerCase();
    if (name.indexOf('auditor') !== -1 || name.indexOf('cierre') !== -1) continue;
    if (name.indexOf(cStr) !== -1) {
      return sheets[j];
    }
  }
  
  for (var k = 0; k < sheets.length; k++) {
    var sName = sheets[k].getName().toLowerCase();
    if (sName.indexOf('auditor') === -1 && sName.indexOf('cierre') === -1) {
      return sheets[k];
    }
  }
  
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
  
  var values = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var sku = String(row[0] || '').trim();
    if (!sku) continue;
    
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
    var rawDamaged = row[15];
    var damagedStock = (rawDamaged !== '' && rawDamaged !== null && !isNaN(rawDamaged)) ? parseFloat(rawDamaged) : 0;
    
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
      damagedStock: damagedStock,
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
  
  if (data.locationString) {
    sheet.getRange(targetRow, 4).setValue(data.locationString);
    location = String(data.locationString);
  }
  
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
  
  sheet.getRange(targetRow, 10).setValue(physicalStock);
  sheet.getRange(targetRow, 11).setValue(variance);
  sheet.getRange(targetRow, 12).setValue(varianceCost);
  sheet.getRange(targetRow, 13).setValue(timestampStr);
  sheet.getRange(targetRow, 14).setValue(counterName);
  sheet.getRange(targetRow, 15).setValue(status);
  
  var damagedStock = parseFloat(data.damagedStock) || 0;
  sheet.getRange(targetRow, 16).setValue(damagedStock); // Columna P (16): Mal_Estado
  
  var damagedNote = (damagedStock > 0) ? ('[Mal Estado: ' + damagedStock + ']') : '';
  var fullAuditNotes = (damagedNote + ' ' + (data.notes || '')).trim();

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
    notes: fullAuditNotes
  });
  
  return {
    success: true,
    message: 'Conteo guardado exitosamente en Google Sheets (' + INVENTORY_TYPE_NAME + ')',
    updatedItem: {
      sku: data.sku,
      description: description,
      location: location,
      systemStock: systemStock,
      physicalStock: physicalStock,
      damagedStock: Number(data.damagedStock) || 0,
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
  var cleanCentro = String(auditData.centro || '1300').replace(/^Centro\s*/i, '').trim();
  var auditSheetName = 'Auditoría - ' + cleanCentro;
  var auditSheet = ss.getSheetByName(auditSheetName);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(auditSheetName);
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
    cleanCentro,
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
      sheet.getRange(r, 10).setValue('');
      sheet.getRange(r, 11).setValue('');
      sheet.getRange(r, 12).setValue('');
      sheet.getRange(r, 13).setValue('');
      sheet.getRange(r, 14).setValue('');
      sheet.getRange(r, 15).setValue('PENDIENTE');
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

function getOrCreateDriveFolder(pathStr) {
  var parts = pathStr.split('/');
  var currentFolder = DriveApp.getRootFolder();
  for (var i = 0; i < parts.length; i++) {
    var partName = parts[i].trim();
    if (!partName) continue;
    var subFolders = currentFolder.getFoldersByName(partName);
    if (subFolders.hasNext()) {
      currentFolder = subFolders.next();
    } else {
      currentFolder = currentFolder.createFolder(partName);
    }
  }
  return currentFolder;
}

function exportConcludedCycleToDrive(ss, data) {
  var centro = String(data.centro || '1300');
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fileName = dateStr + '_Ciclico_Centro_' + centro;
  
  var targetFolder = getOrCreateDriveFolder('Nibol/ciclicos');
  var sheet = findSheetByCentro(ss, centro);
  if (!sheet) throw new Error('Hoja no encontrada para el centro: ' + centro);
  
  var newSs = SpreadsheetApp.create(fileName);
  var newFile = DriveApp.getFileById(newSs.getId());
  newFile.moveTo(targetFolder);
  
  var targetSheet = newSs.getActiveSheet();
  targetSheet.setName('Centro ' + centro);
  
  var sourceRange = sheet.getDataRange();
  var sourceValues = sourceRange.getValues();
  
  if (sourceValues.length > 0) {
    var destRange = targetSheet.getRange(1, 1, sourceValues.length, sourceValues[0].length);
    destRange.setValues(sourceValues);
    
    var header = targetSheet.getRange(1, 1, 1, sourceValues[0].length);
    header.setFontWeight('bold');
    header.setBackground('#0f172a');
    header.setFontColor('#ffffff');
    targetSheet.setFrozenRows(1);
    
    for (var c = 1; c <= sourceValues[0].length; c++) {
      targetSheet.autoResizeColumn(c);
    }
  }
  
  var lastRow = targetSheet.getLastRow() + 2;
  var opName = data.operatorName || 'Operador';
  var opRole = data.operatorRole || data.operatorCargo || 'AUXILIAR';
  var nowFull = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  
  targetSheet.getRange(lastRow, 1).setValue('FIRMA DIGITAL DE CONFORMIDAD - ' + INVENTORY_TYPE_NAME + ' CONCLUIDO').setFontWeight('bold').setFontSize(11);
  targetSheet.getRange(lastRow + 1, 1).setValue('Firmado por: ' + opName + ' (' + opRole + ') | Fecha: ' + nowFull + ' | Estado: CONCLUIDO Y AUDITADO').setFontStyle('italic').setFontSize(9);
  
  if (data.notes) {
    targetSheet.getRange(lastRow + 2, 1).setValue('Observaciones: ' + data.notes).setFontSize(9);
  }
  
  if (data.signatureBase64 && data.signatureBase64.indexOf('base64,') !== -1) {
    try {
      var base64Data = data.signatureBase64.split('base64,')[1];
      var decodedBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', 'firma_digital.png');
      targetSheet.insertImage(decodedBlob, 1, lastRow + 3);
    } catch (imgErr) {
      Logger.log('Aviso firma imagen: ' + imgErr);
    }
  }

  exportCentroAuditSheet(ss, newSs, centro, nowFull, opName, '[CIERRE CONCLUIDO] ' + (data.notes || 'Conteo finalizado y firmado'));
  recordCycleConclusion(ss, data);
  
  return {
    success: true,
    message: 'Archivo ' + fileName + ' creado exitosamente en Google Drive (carpeta Nibol/ciclicos)',
    fileId: newSs.getId(),
    fileName: fileName,
    fileUrl: newSs.getUrl(),
    folderName: 'Nibol/ciclicos',
    folderUrl: targetFolder.getUrl()
  };
}

function exportJustifiedCycleToDrive(ss, data) {
  var centro = String(data.centro || '1300');
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var nowFull = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var fileName = data.nuevoNombre || (dateStr + '_Ciclico_Centro_' + centro + '_Revisado');
  var obsGenerales = data.observacionesGenerales || data.finalNotes || '';
  var correcciones = data.correcciones;
  
  var targetFolder;
  if (data.folderId && data.folderId !== 'ID_DE_TU_CARPETA') {
    try {
      targetFolder = DriveApp.getFolderById(data.folderId);
    } catch (fErr) {
      targetFolder = getOrCreateDriveFolder('Nibol/ciclicos');
    }
  } else {
    targetFolder = getOrCreateDriveFolder('Nibol/ciclicos');
  }
  
  var newSs = SpreadsheetApp.create(fileName);
  var newFile = DriveApp.getFileById(newSs.getId());
  newFile.moveTo(targetFolder);
  
  var sheet = newSs.getActiveSheet();
  sheet.setName('Centro ' + centro);
  
  var headers = [
    'SKU', 'Código_Barras', 'Descripción', 'Ubicación', 'Categoría', 'Clase ABC', 'Unidad',
    'Costo Unitario ($)', 'Stock Sistema', 'Conteo Físico 1er', 'Conteo Final Verificado',
    'Diferencia Final', 'Impacto Financiero ($)', 'Estado Final', 'Tipo Justificación',
    'Comentarios y Causa', 'Evidencias Fotográficas', 'Verificado Por', 'Fecha Verificación'
  ];
  
  var rows = [headers];
  var items = data.items || [];
  
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var photosList = (it.photos && Array.isArray(it.photos)) ? it.photos.join(' | ') : '';
    rows.push([
      it.sku || '',
      it.barcode || '',
      it.description || '',
      it.location || '',
      it.category || 'General',
      it.abcClass || 'B',
      it.unit || 'UND',
      Number(it.unitCost) || 0,
      Number(it.systemStock) || 0,
      it.physicalStock !== null && it.physicalStock !== undefined ? Number(it.physicalStock) : '-',
      it.finalVerifiedStock !== null && it.finalVerifiedStock !== undefined ? Number(it.finalVerifiedStock) : (it.physicalStock || 0),
      Number(it.variance) || 0,
      Number(it.varianceCost) || 0,
      it.status || 'Cuadrado',
      it.justificationType || 'Sin Discrepancia',
      it.comments || '',
      photosList,
      it.verifiedBy || data.adminName || 'ADMIN',
      it.verifiedAt || dateStr
    ]);
  }
  
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
  
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  
  for (var r = 2; r <= rows.length; r++) {
    sheet.getRange(r, 8).setNumberFormat('$#,##0.00');
    sheet.getRange(r, 9).setNumberFormat('#,##0');
    sheet.getRange(r, 11).setNumberFormat('#,##0');
    sheet.getRange(r, 12).setNumberFormat('#,##0');
    sheet.getRange(r, 13).setNumberFormat('$#,##0.00');
  }
  
  if (correcciones && Array.isArray(correcciones)) {
    correcciones.forEach(function(item) {
      if (item && item.celda && item.valor !== undefined) {
        try {
          sheet.getRange(item.celda).setValue(item.valor);
        } catch (cErr) {
          Logger.log('Aviso corrección celda: ' + cErr);
        }
      }
    });
  }
  
  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
  
  var lastRow = sheet.getLastRow() + 2;
  sheet.getRange(lastRow, 1).setValue('CERTIFICACIÓN DE VERIFICACIÓN FINAL Y JUSTIFICACIÓN DE DISCREPANCIAS').setFontWeight('bold').setFontSize(11);
  sheet.getRange(lastRow + 1, 1).setValue('Aprobado y auditado por: ' + (data.adminName || 'Administrador') + ' | Fecha de Cierre: ' + nowFull + ' | Carpeta Google Drive: Nibol/ciclicos').setFontStyle('italic').setFontSize(9);
  
  if (obsGenerales) {
    sheet.getRange(lastRow + 2, 1).setValue('Observaciones Administrativas: ' + obsGenerales).setFontSize(9);
  }
  
  exportCentroAuditSheet(ss, newSs, centro, nowFull, data.adminName || 'ADMIN', '[REVISIÓN OFICIAL TERMINADA] ' + (obsGenerales || 'Revisión finalizada y aprobada'));
  SpreadsheetApp.flush();

  recordCycleConclusion(ss, {
    centro: centro,
    operatorName: data.adminName || 'ADMIN',
    operatorCargo: 'ADMINISTRADOR',
    totalCounted: items.length,
    iraPercent: data.summary ? data.summary.iraPercent : 100,
    notes: '[REVISIÓN FINAL APROBADA] ' + (obsGenerales || '')
  });
  
  return {
    status: 'success',
    success: true,
    message: 'Copia generada exitosamente con las correcciones en Google Drive (Nibol/ciclicos)',
    newFileId: newSs.getId(),
    fileId: newSs.getId(),
    newFileUrl: newSs.getUrl(),
    fileUrl: newSs.getUrl(),
    fileName: fileName,
    folderName: 'Nibol/ciclicos',
    folderUrl: targetFolder.getUrl()
  };
}

function exportCentroAuditSheet(masterSs, targetSs, centro, nowFull, adminOrCounter, finalNote) {
  var cStr = String(centro || '1300').replace(/^Centro\s*/i, '').trim();
  var auditSheetName = 'Auditoría - ' + cStr;
  var auditSheet = targetSs.insertSheet(auditSheetName);
  
  var auditHeaders = [
    'Marca Temporal', 'Centro', 'SKU', 'Descripción', 'Ubicación',
    'Costo Unitario ($)', 'Stock Sistema', 'Stock Físico', 'Diferencia',
    'Costo Diferencia ($)', 'Responsable', 'Observaciones'
  ];
  
  var auditRows = [auditHeaders];
  
  var specificAudit = masterSs.getSheetByName(auditSheetName) || 
                      masterSs.getSheetByName('Auditoría ' + cStr) || 
                      masterSs.getSheetByName('Auditoria_' + cStr) || 
                      masterSs.getSheetByName('Auditoría Conteos');
                      
  if (specificAudit && specificAudit.getLastRow() > 1) {
    var masterValues = specificAudit.getDataRange().getValues();
    for (var m = 1; m < masterValues.length; m++) {
      var row = masterValues[m];
      var rowCentro = String(row[1] || '').replace(/^Centro\s*/i, '').trim().toLowerCase();
      if (specificAudit.getName() !== 'Auditoría Conteos' || rowCentro === cStr.toLowerCase()) {
        auditRows.push(row);
      }
    }
  }
  
  auditRows.push([
    nowFull,
    cStr,
    'TODO_EL_CENTRO',
    'CONCLUSIÓN Y AUDITORÍA DE ' + INVENTORY_TYPE_NAME,
    'TODAS LAS UBICACIONES',
    0,
    0,
    0,
    0,
    0,
    adminOrCounter,
    finalNote
  ]);
  
  auditSheet.getRange(1, 1, auditRows.length, auditHeaders.length).setValues(auditRows);
  
  var aHeader = auditSheet.getRange(1, 1, 1, auditHeaders.length);
  aHeader.setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  auditSheet.setFrozenRows(1);
  
  for (var ac = 1; ac <= auditHeaders.length; ac++) {
    auditSheet.autoResizeColumn(ac);
  }
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

function probarPermisosDrive() {
  var folder = getOrCreateDriveFolder('Nibol/ciclicos');
  Logger.log('Carpeta Nibol/ciclicos lista en Drive: ' + folder.getUrl());
  return 'Permisos concedidos exitosamente. Carpeta: ' + folder.getUrl();
}
