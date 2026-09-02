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

  formatDate(date) {
    if (!date) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  getCenterName(center) {
    if (!center) return 'Volvo - Km 14';
    const found = config.findCenter(center);
    if (found && found.name) return found.name;
    return String(center).trim();
  }

  sanitizeFilename(name) {
    if (!name) return 'ITEM';
    return String(name).trim().replace(/[/\\?%*:|"<>]/g, '_');
  }

  /**
   * Generates exact Google Drive path and filename:
   * Mal Estado: nibol/ciclicos/fotos/malestado/{fecha}/{centro}/{sku}.jpg
   * Justificaciones: nibol/ciclicos/fotos/justificaciones/{fecha}/{centro}/{sku}.jpg
   */
  getPhotoDriveDetails({ category = 'malestado', sku = 'SKU', center = '1120', date = new Date(), ext = '.jpg' }) {
    const cleanCategory = String(category).toLowerCase().includes('just') ? 'justificaciones' : 'malestado';
    const dateStr = this.formatDate(date);
    const centerName = this.getCenterName(center);
    const cleanSku = this.sanitizeFilename(sku);
    const fileExt = ext.startsWith('.') ? ext : `.${ext}`;
    const fileName = `${cleanSku}${fileExt}`;

    const folderPath = `nibol/ciclicos/fotos/${cleanCategory}/${dateStr}/${centerName}`;
    const logicalPath = `${folderPath}/${fileName}`;

    return {
      category: cleanCategory,
      date: dateStr,
      centerName,
      cleanSku,
      fileName,
      folderPath,
      logicalPath
    };
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
        Mal_estado: item.Mal_estado || 0,
        Comentario: item.Comentario || ''
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

  async savePhotoFile(fileBuffer, originalName = 'photo.jpg', mimeType = 'image/jpeg', metadata = {}) {
    const ext = path.extname(originalName) || (mimeType === 'image/png' ? '.png' : '.jpg');
    
    // Determine category: 'malestado' or 'justificaciones'
    let category = metadata.category || metadata.photoType || 'malestado';
    if (String(category).toLowerCase().includes('just')) {
      category = 'justificaciones';
    } else {
      category = 'malestado';
    }

    let sku = metadata.sku || '';
    let center = metadata.center || '';
    let date = metadata.date || new Date();

    // If inventoryId provided and center/date/sku missing, look up inventory
    if (metadata.inventoryId && (!sku || !center)) {
      try {
        const inventoryService = require('./inventoryService');
        const inv = inventoryService.getInventoryRaw(metadata.inventoryId);
        if (inv) {
          if (!center) center = inv.center;
          if (!metadata.date && inv.createdAt) date = inv.createdAt;
          if (metadata.itemId && !sku) {
            const item = inv.items?.find(it => it.id === metadata.itemId);
            if (item) sku = item.SKU;
          }
        }
      } catch (e) {
        // ignore lookup fallback
      }
    }

    if (!sku) sku = 'SKU_' + Date.now().toString(36);
    if (!center) center = '1120';

    const details = this.getPhotoDriveDetails({
      category,
      sku,
      center,
      date,
      ext
    });

    // 1. Generate unique photo ID for URL mapping & backward compatibility
    const photoId = `PHOTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
    const legacyPath = path.join(this.photosDir, photoId);

    // 2. Save in data/photos/
    fs.writeFileSync(legacyPath, fileBuffer);

    // 3. Save in organized structured path: data/photos/{category}/{date}/{centerName}/{sku}.jpg
    const structuredDir = path.join(this.photosDir, details.category, details.date, details.centerName);
    if (!fs.existsSync(structuredDir)) {
      fs.mkdirSync(structuredDir, { recursive: true });
    }
    const structuredPath = path.join(structuredDir, details.fileName);
    fs.writeFileSync(structuredPath, fileBuffer);

    // 4. Save in root nibol structure: nibol/ciclicos/fotos/{category}/{date}/{centerName}/{sku}.jpg
    const nibolBaseDir = path.resolve(__dirname, '..', '..', 'nibol', 'ciclicos', 'fotos', details.category, details.date, details.centerName);
    try {
      if (!fs.existsSync(nibolBaseDir)) {
        fs.mkdirSync(nibolBaseDir, { recursive: true });
      }
      fs.writeFileSync(path.join(nibolBaseDir, details.fileName), fileBuffer);
    } catch (e) {
      console.warn('[driveService] Notice saving to nibol/ root folder:', e.message);
    }

    // 5. Sync to Google Drive via Google Apps Script
    try {
      await gasService.syncPhotoToGAS({
        category: details.category,
        date: details.date,
        center: details.centerName,
        sku: details.cleanSku,
        fileName: details.fileName,
        folderPath: details.folderPath,
        fileBuffer,
        mimeType,
        inventoryId: metadata.inventoryId || null
      });
    } catch (err) {
      console.warn('[driveService] Notice during GAS photo sync:', err.message);
    }

    return {
      photoId,
      filename: photoId,
      url: `/api/photos/${photoId}`,
      driveFolderPath: details.folderPath,
      driveLogicalPath: details.logicalPath,
      driveFileName: details.fileName,
      category: details.category,
      sku: details.cleanSku,
      center: details.centerName,
      date: details.date,
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
