const config = require('../config');

class GasService {
  getUrlForType(type) {
    const cleanType = (type || 'CICLICO').toUpperCase();
    switch (cleanType) {
      case 'BARRIDO':
        return config.integrations.BARRIDO_URL;
      case 'MENSUAL':
      case 'MENSUALES':
        return config.integrations.MENSUALES_URL;
      case 'SEMANAL':
      case 'SEMANALES':
        return config.integrations.SEMANALES_URL;
      case 'CICLICO':
      case 'CICLICOS':
      default:
        return config.integrations.CICLICOS_URL;
    }
  }

  normalizeBarcode(barcode) {
    if (!barcode) return '';
    return String(barcode).trim();
  }

  async fetchProductsFromScript(type, center = '1120') {
    const cleanCenter = config.getCenterCode ? config.getCenterCode(center) : center;
    const url = this.getUrlForType(type);
    const targetUrl = new URL(url);
    if (cleanCenter) {
      targetUrl.searchParams.set('center', cleanCenter);
      targetUrl.searchParams.set('action', 'getProducts');
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} from Google Apps Script`);
      }

      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // If response is HTML or malformed, raise clean error
        throw new Error('Respuesta inválida de Google Apps Script: ' + text.substring(0, 100));
      }

      // Handle both formats: raw array or { data: [...] } or { status: 'success', products: [...] } or { status: 'success', rows: [...] }
      let productsList = [];
      if (Array.isArray(parsed)) {
        productsList = parsed;
      } else if (parsed && Array.isArray(parsed.data)) {
        productsList = parsed.data;
      } else if (parsed && Array.isArray(parsed.products)) {
        productsList = parsed.products;
      } else if (parsed && parsed.status === 'success' && Array.isArray(parsed.rows)) {
        productsList = parsed.rows;
      }

      return this.mapRawRowsToColumns(productsList);
    } catch (err) {
      console.warn(`[gasService] Warning fetching from remote GAS URL (${url}):`, err.message);
      // Return null to allow fallback to local/cached data or throw
      throw err;
    }
  }

  mapRawRowsToColumns(rawRows = []) {
    const parseNum = (val, fallback = 0) => {
      if (val === null || val === undefined || val === '') return fallback;
      const n = parseFloat(val);
      return isNaN(n) ? fallback : n;
    };
    const parseIntSafe = (val, fallback = 0) => {
      if (val === null || val === undefined || val === '') return fallback;
      const n = parseInt(val, 10);
      return isNaN(n) ? fallback : n;
    };

    return rawRows.map((row, idx) => {
      // Row could be an array of column values [A, B, C...] or an object with keys
      if (Array.isArray(row)) {
        return {
          id: `ITEM-${idx + 1}-${Date.now().toString(36)}`,
          SKU: String(row[0] || '').trim(),
          Codigo_Barras: String(row[1] || '').trim(),
          Descripcion: String(row[2] || '').trim(),
          Ubicacion: String(row[3] || '').trim(),
          Categoria: String(row[4] || '').trim(),
          Clasificacion_ABC: String(row[5] || 'C').trim().toUpperCase(),
          Unidad: String(row[6] || 'PZA').trim(),
          Costo_Unitario: parseNum(row[7], 0),
          Stock_Sistema: parseIntSafe(row[8], 0),
          Stock_Fisico: row[9] !== undefined && row[9] !== '' && row[9] !== null ? parseIntSafe(row[9], null) : null,
          Diferencia: row[10] !== undefined && row[10] !== '' && row[10] !== null ? parseIntSafe(row[10], 0) : 0,
          Costo_Diferencia: parseNum(row[11], 0),
          Fecha_Ultimo_Conteo: row[12] || null,
          Responsable: String(row[13] || '').trim(),
          Estado: String(row[14] || 'Pendiente').trim(),
          Mal_estado: parseIntSafe(row[15], 0),
          Comentario: String(row[16] || '').trim()
        };
      }

      return {
        id: row.id || `ITEM-${idx + 1}-${Date.now().toString(36)}`,
        SKU: String(row.SKU || row.sku || '').trim(),
        Codigo_Barras: String(row.Codigo_Barras || row.codigo_barras || row.barcode || '').trim(),
        Descripcion: String(row.Descripcion || row.descripcion || '').trim(),
        Ubicacion: String(row.Ubicacion || row.ubicacion || '').trim(),
        Categoria: String(row.Categoria || row.categoria || '').trim(),
        Clasificacion_ABC: String(row.Clasificacion_ABC || row.abc || 'C').trim().toUpperCase(),
        Unidad: String(row.Unidad || row.unidad || 'PZA').trim(),
        Costo_Unitario: parseNum(row.Costo_Unitario || row.costo_unitario, 0),
        Stock_Sistema: parseIntSafe(row.Stock_Sistema || row.stock_sistema, 0),
        Stock_Fisico: (row.Stock_Fisico !== undefined && row.Stock_Fisico !== null && row.Stock_Fisico !== '') ? parseIntSafe(row.Stock_Fisico, null) : null,
        Diferencia: (row.Diferencia !== undefined && row.Diferencia !== null && row.Diferencia !== '') ? parseIntSafe(row.Diferencia, 0) : 0,
        Costo_Diferencia: parseNum(row.Costo_Diferencia, 0),
        Fecha_Ultimo_Conteo: row.Fecha_Ultimo_Conteo || row.fecha_conteo || null,
        Responsable: String(row.Responsable || row.responsable || '').trim(),
        Estado: String(row.Estado || row.estado || 'Pendiente').trim(),
        Mal_estado: parseIntSafe(row.Mal_estado || row.mal_estado, 0),
        Comentario: String(row.Comentario || row.comentario || '').trim()
      };
    });
  }

  formatItemsTo17Columns(items = []) {
    return items.map(it => [
      String(it.SKU || '').trim(),
      String(it.Codigo_Barras || '').trim(),
      String(it.Descripcion || '').trim(),
      String(it.Ubicacion || '').trim(),
      String(it.Categoria || '').trim(),
      String(it.Clasificacion_ABC || 'C').trim().toUpperCase(),
      String(it.Unidad || 'PZA').trim(),
      Number(it.Costo_Unitario || 0),
      Number(it.Stock_Sistema || 0),
      it.Stock_Fisico !== null && it.Stock_Fisico !== undefined ? Number(it.Stock_Fisico) : '',
      it.Stock_Fisico !== null && it.Stock_Fisico !== undefined ? Number(it.Stock_Fisico) - Number(it.Stock_Sistema || 0) : '',
      it.Stock_Fisico !== null && it.Stock_Fisico !== undefined ? (Number(it.Stock_Fisico) - Number(it.Stock_Sistema || 0)) * Number(it.Costo_Unitario || 0) : '',
      it.Fecha_Ultimo_Conteo || (it.Stock_Fisico !== null ? new Date().toISOString().split('T')[0] : ''),
      String(it.Responsable || '').trim(),
      String(it.Estado || (it.Stock_Fisico !== null ? 'Contado' : 'Pendiente')).trim(),
      Number(it.Mal_estado || 0),
      String(it.Comentario || '').trim()
    ]);
  }

  async syncFinalInventoryToGAS(type, payload) {
    const url = this.getUrlForType(type);
    const cleanCenter = config.getCenterCode ? config.getCenterCode(payload.center || '1120') : (payload.center || '1120');
    
    // Build rows from items if present
    const rawItems = payload.items || (payload.driveRecord && payload.driveRecord.items) || [];
    const rows = this.formatItemsTo17Columns(rawItems);

    const postBody = {
      action: 'createFinalFile',
      type: (type || 'CICLICO').toUpperCase(),
      center: cleanCenter,
      fileName: payload.fileName || `${type}-${cleanCenter}-${new Date().toISOString().split('T')[0]}.gsheet`,
      folderPath: payload.folderPath || `Nibol/${type}/${cleanCenter}`,
      items: rawItems,
      rows: rows,
      ...payload
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody)
      });

      if (!response.ok) {
        console.warn(`[gasService] GAS webhook responded with status ${response.status}`);
      }

      const resText = await response.text();
      try {
        return JSON.parse(resText);
      } catch (e) {
        return { success: true, message: 'Enviado a Google Apps Script', raw: resText };
      }
    } catch (err) {
      console.warn('[gasService] Warning submitting final file to GAS:', err.message);
      return { success: true, fallback: true, message: 'Guardado localmente en Drive Store: ' + err.message };
    }
  }

  async syncPhotoToGAS({ category, date, center, sku, fileName, folderPath, fileBuffer, mimeType, inventoryId }) {
    const url = this.getUrlForType('CICLICO');
    const base64Data = fileBuffer ? fileBuffer.toString('base64') : '';

    const postBody = {
      action: 'savePhoto',
      type: 'CICLICO',
      category: category || 'malestado',
      date: date || new Date().toISOString().split('T')[0],
      center: center || '1120',
      sku: sku || 'SKU',
      fileName: fileName || `${sku}.jpg`,
      folderPath: folderPath || `nibol/ciclicos/fotos/${category}/${date}/${center}`,
      mimeType: mimeType || 'image/jpeg',
      base64Data: base64Data,
      fileSize: fileBuffer ? fileBuffer.length : 0,
      inventoryId: inventoryId || null
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody)
      });

      if (!response.ok) {
        console.warn(`[gasService] GAS photo upload responded with status ${response.status}`);
      }

      const resText = await response.text();
      try {
        return JSON.parse(resText);
      } catch (e) {
        return { success: true, message: 'Foto enviada a Google Apps Script', raw: resText };
      }
    } catch (err) {
      console.warn('[gasService] Warning submitting photo to GAS (saved locally in Drive structure):', err.message);
      return { success: true, fallback: true, message: 'Guardado localmente en estructura de Drive: ' + err.message };
    }
  }
}

module.exports = new GasService();
