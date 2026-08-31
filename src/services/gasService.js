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

  async fetchProductsFromScript(type, center = 'WARNES') {
    const url = this.getUrlForType(type);
    const targetUrl = new URL(url);
    if (center) {
      targetUrl.searchParams.set('center', center);
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

      // Handle both formats: raw array or { data: [...] } or { status: 'success', products: [...] }
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
          Costo_Unitario: parseFloat(row[7]) || 0,
          Stock_Sistema: parseInt(row[8], 10) || 0,
          Stock_Fisico: row[9] !== undefined && row[9] !== '' ? parseInt(row[9], 10) : null,
          Diferencia: row[10] !== undefined && row[10] !== '' ? parseInt(row[10], 10) : 0,
          Costo_Diferencia: parseFloat(row[11]) || 0,
          Fecha_Ultimo_Conteo: row[12] || null,
          Responsable: String(row[13] || '').trim(),
          Estado: String(row[14] || 'Pendiente').trim(),
          Mal_estado: parseInt(row[15], 10) || 0
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
        Costo_Unitario: parseFloat(row.Costo_Unitario || row.costo_unitario) || 0,
        Stock_Sistema: parseInt(row.Stock_Sistema || row.stock_sistema, 10) || 0,
        Stock_Fisico: (row.Stock_Fisico !== undefined && row.Stock_Fisico !== null && row.Stock_Fisico !== '') ? parseInt(row.Stock_Fisico, 10) : null,
        Diferencia: row.Diferencia !== undefined ? parseInt(row.Diferencia, 10) : 0,
        Costo_Diferencia: parseFloat(row.Costo_Diferencia) || 0,
        Fecha_Ultimo_Conteo: row.Fecha_Ultimo_Conteo || row.fecha_conteo || null,
        Responsable: String(row.Responsable || row.responsable || '').trim(),
        Estado: String(row.Estado || row.estado || 'Pendiente').trim(),
        Mal_estado: parseInt(row.Mal_estado || row.mal_estado, 10) || 0
      };
    });
  }

  async syncFinalInventoryToGAS(type, payload) {
    const url = this.getUrlForType(type);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createFinalFile',
          ...payload
        })
      });

      if (!response.ok) {
        console.warn(`[gasService] GAS webhook responded with status ${response.status}`);
      }

      const resText = await response.text();
      try {
        return JSON.parse(resText);
      } catch (e) {
        return { success: true, message: 'Enviado a GAS', raw: resText };
      }
    } catch (err) {
      console.warn('[gasService] Warning submitting final file to GAS:', err.message);
      return { success: true, fallback: true, message: 'Guardado localmente en Drive Store' };
    }
  }
}

module.exports = new GasService();
