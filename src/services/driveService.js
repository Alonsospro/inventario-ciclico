const fs = require('fs');
const path = require('path');
const config = require('../config');
const storagePath = require('./storagePath');
const gasService = require('./gasService');

class DriveService {
  constructor() {
    this.historyDir = storagePath.getHistoryDirectory();
    this.photosDir = storagePath.getPhotosDirectory();
  }

  formatInventoryFileName(type, center, date = new Date()) {
    const cleanType = (type || 'CICLICO').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cleanCenter = (center || 'WARNES').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let dateStr = '';
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dateStr = date;
    } else {
      const d = new Date(date);
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return `${cleanType}-${cleanCenter}-${dateStr}`;
  }

  formatJustificationName(type, sku, center) {
    const cleanType = (type || 'CICLICO').toUpperCase();
    const cleanSku = (sku || 'SKU').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    const cleanCenter = (center || 'WARNES').toUpperCase();
    return `JUST-${cleanType}-${cleanSku}-${cleanCenter}`;
  }

  getDriveFolderPath(type, center) {
    const cleanType = (type || 'CICLICO').toUpperCase();
    const cleanCenter = (center || 'WARNES').toUpperCase();
    return `${config.drive.baseFolder}/${cleanType}/${cleanCenter}`;
  }

  async createFinalDriveFile({ inventory, justifications, user, reviewNotes }) {
    const { id, type, center, items } = inventory;
    const fileName = this.formatInventoryFileName(type, center, new Date());
    const folderPath = this.getDriveFolderPath(type, center);

    const fileId = `DRIVE-FILE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const driveRecord = {
      fileId,
      fileName: `${fileName}.xlsx`,
      logicalPath: `${folderPath}/${fileName}.xlsx`,
      inventoryId: id,
      type,
      center,
      closedBy: user.username,
      closedAt: new Date().toISOString(),
      reviewNotes: reviewNotes || 'Revisión finalizada y aprobada por administrador',
      totalItems: items.length,
      justificationsCount: (justifications || []).length,
      items: items.map(item => ({
        SKU: item.SKU,
        Codigo_Barras: item.Codigo_Barras,
        Descripcion: item.Descripcion,
        Ubicacion: item.Ubicacion,
        Categoria: item.Categoria,
        Clasificacion_ABC: item.Clasificacion_ABC,
        Unidad: item.Unidad,
        Costo_Unitario: item.Costo_Unitario,
        Stock_Sistema: item.Stock_Sistema,
        Stock_Fisico: item.Stock_Fisico,
        Diferencia: (item.Stock_Fisico !== null ? item.Stock_Fisico : 0) - item.Stock_Sistema,
        Costo_Diferencia: ((item.Stock_Fisico !== null ? item.Stock_Fisico : 0) - item.Stock_Sistema) * (item.Costo_Unitario || 0),
        Fecha_Ultimo_Conteo: item.Fecha_Ultimo_Conteo,
        Responsable: item.Responsable,
        Estado: 'Revisado',
        Mal_estado: item.Mal_estado || 0
      })),
      justifications: justifications || []
    };

    // Save final file record to history directory
    const historyFilePath = path.join(this.historyDir, `${fileId}.json`);
    storagePath.writeJson(historyFilePath, driveRecord);

    // Call GAS Webhook
    try {
      await gasService.syncFinalInventoryToGAS(type, {
        fileId,
        fileName: `${fileName}.xlsx`,
        folderPath,
        driveRecord
      });
    } catch (err) {
      console.warn('[driveService] GAS remote sync fallback:', err.message);
    }

    return {
      success: true,
      fileId,
      fileName: `${fileName}.xlsx`,
      folderPath,
      driveUrl: `https://drive.google.com/drive/folders/nibol-${center.toLowerCase()}-${type.toLowerCase()}`,
      historyFilePath
    };
  }

  savePhotoFile(fileBuffer, originalName, mimeType) {
    const ext = path.extname(originalName) || (mimeType === 'image/png' ? '.png' : '.jpg');
    const photoId = `PHOTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
    const targetPath = path.join(this.photosDir, photoId);

    fs.writeFileSync(targetPath, fileBuffer);
    return {
      photoId,
      filename: photoId,
      url: `/api/photos/${photoId}`,
      mimeType: mimeType || 'image/jpeg',
      size: fileBuffer.length
    };
  }

  getPhotoPath(filename) {
    // Prevent path traversal
    const safeName = path.basename(filename);
    const fullPath = path.join(this.photosDir, safeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }
}

module.exports = new DriveService();
