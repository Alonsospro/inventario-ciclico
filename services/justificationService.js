const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');
const excelService = require('./excelService');
const googleSheetService = require('./googleSheetService');
const auditService = require('./auditService');
const configService = require('./configService');

const JUSTIFICATIONS_FILE = storagePath.getDataFilePath('justifications.json');
const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1eYg5xYTpWVhgBk_vLDJH3_ZxAMxGc-wY?usp=sharing';
const GOOGLE_DRIVE_FOLDER_ID = '1eYg5xYTpWVhgBk_vLDJH3_ZxAMxGc-wY';

class JustificationService {
  constructor() {
    this.ensureDirectory();
  }

  ensureDirectory() {
    storagePath.ensureDataDirectory();
  }

  /**
   * Get formatted local subfolder for a cycle: uploads/justificaciones/[Centro]_[Fecha]/
   */
  getCycleUploadDir(centro, dateStr = null) {
    const safeCentro = String(centro || '1300').trim().replace(/[^a-zA-Z0-9]/g, '_');
    const datePart = dateStr || new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const folderName = `Centro_${safeCentro}_${datePart}`;
    
    const uploadsDir = storagePath.getUploadsDir();
    const targetDir = path.join(uploadsDir, 'justificaciones', folderName);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    return {
      absolutePath: targetDir,
      folderName: folderName,
      relativeWebPath: `/uploads/justificaciones/${folderName}`
    };
  }

  /**
   * Format file name with the date of execution first:
   * [YYYY-MM-DD]_[SKU]_[NombreItem]_[HHmmss].[ext]
   */
  generatePhotoFilename(sku, itemName, originalExt = '.jpg') {
    const now = new Date();
    const dateStr = now.toISOString().substring(0, 10); // YYYY-MM-DD
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    
    const safeSku = String(sku || 'SKU').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanItem = String(itemName || 'Item')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);

    const ext = originalExt.startsWith('.') ? originalExt : `.${originalExt}`;
    // Format starts with date: [Fecha]_[SKU]_[NombreItem]_[Hora].[ext]
    return `${dateStr}_${safeSku}_${cleanItem}_${timeStr}${ext}`;
  }

  /**
   * Generate standard document filename with date:
   * [YYYY-MM-DD]_Ciclico_Centro_[Centro].xlsx
   */
  generateDocumentFilename(centro, dateStr = null) {
    const safeCentro = String(centro || '1300').trim();
    const datePart = dateStr || new Date().toISOString().substring(0, 10);
    return `${datePart}_Ciclico_Centro_${safeCentro}.xlsx`;
  }

  loadData() {
    try {
      this.ensureDirectory();
      if (!fs.existsSync(JUSTIFICATIONS_FILE)) {
        this.saveData([]);
        return [];
      }
      const raw = fs.readFileSync(JUSTIFICATIONS_FILE, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('Error reading justifications.json, returning empty list:', err.message);
      return [];
    }
  }

  saveData(data) {
    try {
      this.ensureDirectory();
      fs.writeFileSync(JUSTIFICATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving justifications.json:', err.message);
    }
  }

  /**
   * Verify if requesting user has ADMIN privileges
   */
  assertIsAdmin(requestingUser) {
    if (!requestingUser) {
      throw new Error('Autenticación requerida para acceder a Verificación y Justificaciones.');
    }
    const role = String(requestingUser.cargo || '').toUpperCase();
    if (role !== 'ADMIN') {
      throw new Error('Acceso denegado: Esta pestaña y sus operaciones son de uso exclusivo para Administradores.');
    }
  }

  /**
   * Get all items requiring verification (discrepancies) with their justification status
   */
  async getVerificationItems(centro, requestingUser, type = 'ciclico') {
    this.assertIsAdmin(requestingUser);

    const targetCentro = String(centro || '1300').trim();
    const t = type || 'ciclico';
    const config = configService.getConfig();
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    let inventoryItems = [];
    if (isGoogleSheets) {
      try {
        const inv = await googleSheetService.getInventory(targetUrl, targetCentro);
        inventoryItems = inv.items || [];
      } catch (e) {
        const inv = await excelService.getInventory(filePath, config.activeSheetName, config.columnMapping, targetCentro);
        inventoryItems = inv.items || [];
      }
    } else {
      const inv = await excelService.getInventory(filePath, config.activeSheetName, config.columnMapping, targetCentro);
      inventoryItems = inv.items || [];
    }

    const allJustifications = this.loadData();
    const centroJustifications = allJustifications.filter(j => String(j.centro).trim() === targetCentro);

    // Map all items, prioritizing items with discrepancies (Faltante / Sobrante)
    const verificationList = inventoryItems.map(item => {
      const existing = centroJustifications.find(j => String(j.sku).trim().toUpperCase() === String(item.sku).trim().toUpperCase());
      const sysStock = Number(item.systemStock) || 0;
      const physStock = item.physicalStock !== null && item.physicalStock !== undefined && item.physicalStock !== '' ? Number(item.physicalStock) : null;
      
      const hasCount = physStock !== null;
      const variance = hasCount ? (physStock - sysStock) : 0;
      const varianceCost = Number((variance * (Number(item.unitCost) || 0)).toFixed(2));
      
      let status = 'Pendiente';
      if (hasCount) {
        if (variance === 0) status = 'Cuadrado';
        else if (variance < 0) status = 'Faltante';
        else status = 'Sobrante';
      }

      return {
        sku: item.sku,
        barcode: item.barcode || '',
        description: item.description,
        location: item.location,
        category: item.category || 'General',
        abcClass: item.abcClass || 'B',
        unit: item.unit || 'UND',
        unitCost: item.unitCost || 0,
        systemStock: sysStock,
        physicalStock: physStock,
        finalVerifiedStock: existing?.finalVerifiedStock !== undefined ? existing.finalVerifiedStock : physStock,
        variance: existing?.variance !== undefined ? existing.variance : variance,
        varianceCost: existing?.varianceCost !== undefined ? existing.varianceCost : varianceCost,
        status: existing?.status || status,
        isDiscrepancy: status === 'Faltante' || status === 'Sobrante',
        justificationType: existing?.justificationType || '',
        comments: existing?.comments || '',
        photos: existing?.photos || [],
        verifiedBy: existing?.verifiedBy || null,
        verifiedAt: existing?.verifiedAt || null,
        driveFolderUrl: existing?.driveFolderUrl || GOOGLE_DRIVE_FOLDER_URL,
        driveFolderName: existing?.driveFolderName || `Centro_${targetCentro}_${new Date().toISOString().substring(0, 10)}`,
        isJustified: Boolean(existing && (existing.comments || existing.photos?.length > 0))
      };
    });

    const nowStr = new Date().toISOString().substring(0, 10);
    const docFileName = this.generateDocumentFilename(targetCentro, nowStr);

    return {
      centro: targetCentro,
      date: nowStr,
      googleDriveRootUrl: GOOGLE_DRIVE_FOLDER_URL,
      googleDriveFolderId: GOOGLE_DRIVE_FOLDER_ID,
      documentFileName: docFileName,
      documentDownloadUrl: `/api/download-excel?centro=${targetCentro}&date=${nowStr}`,
      items: verificationList,
      summary: {
        totalItems: verificationList.length,
        discrepanciesCount: verificationList.filter(i => i.isDiscrepancy).length,
        justifiedCount: verificationList.filter(i => i.isJustified).length,
        pendingJustificationCount: verificationList.filter(i => i.isDiscrepancy && !i.isJustified).length
      }
    };
  }

  /**
   * Save final verification and justification for an item
   */
  async saveItemVerification({
    centro,
    sku,
    description = '',
    location = '',
    unitCost = 0,
    systemStock = 0,
    physicalStock = null,
    finalVerifiedStock = null,
    justificationType = 'AJUSTE_ADMINISTRATIVO',
    comments = '',
    photos = [],
    requestingUser
  }) {
    this.assertIsAdmin(requestingUser);

    const targetCentro = String(centro || '1300').trim();
    const cleanSku = String(sku).trim();
    const adminName = requestingUser.nombre || requestingUser.usuario || 'ADMIN';
    const now = new Date().toISOString();
    const dateStr = now.substring(0, 10);

    const folderInfo = this.getCycleUploadDir(targetCentro, dateStr);

    const verifiedQty = (finalVerifiedStock !== null && finalVerifiedStock !== undefined && !isNaN(finalVerifiedStock))
      ? Number(finalVerifiedStock)
      : (physicalStock !== null ? Number(physicalStock) : 0);

    const sysStock = Number(systemStock) || 0;
    const variance = verifiedQty - sysStock;
    const varianceCost = Number((variance * (Number(unitCost) || 0)).toFixed(2));
    
    let status = 'Cuadrado';
    if (variance < 0) status = 'Faltante';
    if (variance > 0) status = 'Sobrante';

    // 1. Update master Excel / Google Sheet with final verified count if changed
    const t = type || inventoryType || 'ciclico';
    const config = configService.getConfig();
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    const isGoogleSheets = Boolean(targetUrl && config.syncMode === 'google_sheets');

    if (isGoogleSheets) {
      await googleSheetService.updateItemCount(targetUrl, {
        sku: cleanSku,
        physicalStock: verifiedQty,
        counterName: `Admin: ${adminName}`,
        centro: targetCentro,
        notes: `Verificación Admin: ${comments || justificationType}`,
        unitCost: Number(unitCost) || 0,
        systemStock: sysStock
      });
      if (fs.existsSync(filePath)) {
        excelService.updateItemCount(
          filePath,
          config.activeSheetName,
          config.columnMapping,
          {
            sku: cleanSku,
            physicalStock: verifiedQty,
            previousStock: physicalStock,
            isModification: true,
            counterName: `Admin: ${adminName}`,
            centro: targetCentro,
            notes: `Verificación Admin: ${comments || justificationType}`,
            unitCost: Number(unitCost) || 0,
            systemStock: sysStock
          }
        ).catch(err => console.warn('Aviso backup Excel:', err.message));
      }
    } else {
      await excelService.updateItemCount(
        filePath,
        config.activeSheetName,
        config.columnMapping,
        {
          sku: cleanSku,
          physicalStock: verifiedQty,
          previousStock: physicalStock,
          isModification: true,
          counterName: `Admin: ${adminName}`,
          centro: targetCentro,
          notes: `Verificación Admin: ${comments || justificationType}`,
          unitCost: Number(unitCost) || 0,
          systemStock: sysStock
        }
      );
    }

    // 2. Persist justification state
    const allJustifications = this.loadData();
    const existingIndex = allJustifications.findIndex(j => 
      String(j.centro).trim() === targetCentro && 
      String(j.sku).trim().toUpperCase() === cleanSku.toUpperCase()
    );

    const justificationEntry = {
      centro: targetCentro,
      sku: cleanSku,
      originalSystemStock: sysStock,
      initialCount: physicalStock !== null && physicalStock !== undefined && physicalStock !== '' ? Number(physicalStock) : null,
      finalVerifiedStock: verifiedQty,
      variance: variance,
      varianceCost: varianceCost,
      status: status,
      unitCost: Number(unitCost) || 0,
      description: description || '',
      location: location || '',
      justificationType: justificationType || 'Ajuste de Conteo Aprobado',
      comments: comments || '',
      photos: Array.isArray(photos) ? photos : [],
      adminName: adminName,
      adminUser: requestingUser.usuario || 'ADMIN',
      verifiedAt: now,
      isJustified: true
    };

    if (existingIndex >= 0) {
      allJustifications[existingIndex] = {
        ...allJustifications[existingIndex],
        ...justificationEntry
      };
    } else {
      allJustifications.push(justificationEntry);
    }

    this.saveData(allJustifications);

    // 3. Log to audit trail
    auditService.logCountEvent({
      centro: targetCentro,
      sku: cleanSku,
      description: description || '',
      location: location || '',
      systemStock: sysStock,
      physicalStock: verifiedQty,
      previousStock: physicalStock !== null && physicalStock !== undefined ? Number(physicalStock) : null,
      isModification: true,
      unitCost: Number(unitCost) || 0,
      variance: variance,
      varianceCost: varianceCost,
      status: status,
      counterName: `Admin: ${adminName}`,
      counterUser: requestingUser.usuario || 'ADMIN',
      counterRole: 'ADMIN',
      notes: `[JUSTIFICACIÓN]: ${justificationType} - ${comments || 'Sin comentarios'}`
    });

    return {
      success: true,
      message: `Verificación y justificación de ${cleanSku} guardada exitosamente.`,
      justification: justificationEntry
    };
  }

  /**
   * Conclude and finalize verification review for a Centro, saving revised copy into Google Drive Nibol/ciclicos
   */
  async finishVerificationReview({ centro, requestingUser, finalNotes = '', type, inventoryType }) {
    this.assertIsAdmin(requestingUser);

    const targetCentro = String(centro || '1300').trim();
    const t = type || inventoryType || 'ciclico';
    const adminName = requestingUser.nombre || requestingUser.usuario || 'ADMIN';
    const nowStr = new Date().toISOString().substring(0, 10);
    const meta = configService.getInventoryTypeMeta(t);
    const typeLabel = (meta.name || t).replace(/\s+/g, '_');
    const fileName = `${nowStr}_${typeLabel}_Centro_${targetCentro}_Revisado.xlsx`;

    // 1. Fetch full verified items dataset
    const verificationData = await this.getVerificationItems(targetCentro, requestingUser, t);

    // 2. Export revised sheet to Google Drive (folder: Nibol/ciclicos) via Apps Script
    const config = configService.getConfig();
    const targetUrl = configService.getUrlForType(t);
    const filePath = configService.getExcelPathForType(t);
    let driveResult = null;
    
    if (targetUrl && config.syncMode === 'google_sheets') {
      try {
        driveResult = await googleSheetService.finishJustificationsReview(targetUrl, {
          centro: targetCentro,
          adminName: adminName,
          adminCargo: requestingUser.cargo || 'ADMIN',
          finalNotes: finalNotes || '',
          items: verificationData.items,
          summary: verificationData.summary
        });
      } catch (driveErr) {
        console.warn('Aviso guardando revisión en Google Drive:', driveErr.message);
      }
    }

    // 3. Log administrative audit event
    auditService.logCountEvent({
      centro: targetCentro,
      sku: 'TODO_EL_CENTRO',
      description: `REVISIÓN FINAL Y JUSTIFICACIONES (${meta.name.toUpperCase()}) CONCLUIDA`,
      location: 'CENTRO COMPLETO',
      systemStock: 0,
      physicalStock: 0,
      variance: 0,
      varianceCost: 0,
      status: 'REVISIÓN_CONCLUIDA',
      counterName: adminName,
      counterUser: requestingUser.usuario || 'ADMIN',
      counterRole: 'ADMIN',
      notes: `[REVISIÓN TERMINADA - ${meta.name}] ${finalNotes || 'Revisión finalizada y guardada en Google Drive (Nibol/ciclicos)'}`
    });

    const fileUrl = driveResult?.fileUrl || GOOGLE_DRIVE_FOLDER_URL;
    const folderUrl = driveResult?.folderUrl || GOOGLE_DRIVE_FOLDER_URL;

    // 4. Update assignment history record to REVISADO_Y_JUSTIFICADO
    const assignmentService = require('./assignmentService');
    const historyEntry = assignmentService.recordReviewCompleted(targetCentro, {
      adminName: adminName,
      finalNotes: finalNotes || '',
      summary: verificationData.summary,
      googleDriveFileUrl: fileUrl,
      googleDriveFolderUrl: folderUrl,
      fileName: fileName,
      inventoryType: t
    });

    // 5. Clean & reset counting plan sheet for Centro in Excel & Google Sheets
    try {
      if (fs.existsSync(filePath)) {
        await excelService.resetCycle(filePath, config.activeSheetName, config.columnMapping, {}, targetCentro);
      }
      if (targetUrl && config.syncMode === 'google_sheets') {
        await googleSheetService.resetCycle(targetUrl, targetCentro, {});
      }
    } catch (resetErr) {
      console.warn('Aviso limpiando hoja de conteo tras revisión:', resetErr.message);
    }

    // 6. Clear active justifications for this Centro so the verification screen resets
    try {
      const allJustifications = this.loadData();
      const filtered = allJustifications.filter(j => String(j.centro).trim() !== targetCentro);
      this.saveData(filtered);
    } catch (jErr) {
      console.warn('Aviso limpiando justificaciones:', jErr.message);
    }

    return {
      success: true,
      message: `Revisión final del Centro ${targetCentro} concluida con éxito. Planilla guardada en Google Drive (Nibol/ciclicos) y archivada en Historial.`,
      centro: targetCentro,
      date: nowStr,
      fileName: fileName,
      downloadUrl: `/api/download-excel?centro=${targetCentro}&date=${nowStr}&reviewed=true`,
      googleDriveFileUrl: fileUrl,
      googleDriveFolderUrl: folderUrl,
      summary: verificationData.summary,
      historyEntry: historyEntry
    };
  }
}

module.exports = new JustificationService();
