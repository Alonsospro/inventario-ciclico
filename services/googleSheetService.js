/**
 * Google Sheets Service via Google Apps Script Web App API
 * Zero-maintenance, real-time cloud synchronization between the web app
 * and Google Spreadsheet.
 */

class GoogleSheetService {
  /**
   * Validate and clean up Web App URL
   */
  cleanUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      trimmed = 'https://' + trimmed;
    }
    return trimmed;
  }

  /**
   * Safely parse JSON response from Google Apps Script, detecting Google login redirects
   */
  async parseJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (text.includes('accounts.google.com') || text.includes('Sign in') || text.includes('<!doctype') || text.includes('<html')) {
        throw new Error('Google Apps Script requiere permisos de acceso: En Google Apps Script haz clic en "Implementar" -> "Administrar implementaciones" -> Editar -> Cambia "Quién tiene acceso" a "Cualquier usuario" (Anyone).');
      }
      throw new Error(`Respuesta no válida de Google Apps Script: ${text.slice(0, 100)}`);
    }
  }

  /**
   * Test connection to Google Apps Script Web App
   */
  async ping(webAppUrl) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const pingUrl = `${url}${url.includes('?') ? '&' : '?'}action=ping&_t=${Date.now()}`;
    const response = await fetch(pingUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error de conexión con Google Apps Script (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Get list of sheets from Google Spreadsheet
   */
  async getSheets(webAppUrl) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const queryUrl = `${url}${url.includes('?') ? '&' : '?'}action=getSheets&_t=${Date.now()}`;
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al consultar hojas (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Get inventory items for a specific Centro (with automatic tab name resolution)
   */
  async getInventory(webAppUrl, centro = '1300') {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const queryUrl = `${url}${url.includes('?') ? '&' : '?'}action=getInventory&centro=${encodeURIComponent(centro)}&_t=${Date.now()}`;
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al obtener inventario del Centro ${centro} (HTTP ${response.status})`);
    }

    let data = await this.parseJsonResponse(response);

    // If target sheet has 0 items, check if duplicate tab with suffix ' (1)' has data
    if (data && data.success && (!data.items || data.items.length === 0)) {
      try {
        const altUrl = `${url}${url.includes('?') ? '&' : '?'}action=getInventory&centro=${encodeURIComponent(centro + ' (1)')}&_t=${Date.now()}`;
        const altRes = await fetch(altUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, redirect: 'follow' });
        if (altRes.ok) {
          const altData = await this.parseJsonResponse(altRes);
          if (altData && altData.success && altData.items && altData.items.length > 0) {
            data = altData;
          }
        }
      } catch (e) {
        // ignore fallback error
      }
    }

    return data;
  }

  /**
   * Get analytics for a specific Centro
   */
  async getAnalytics(webAppUrl, centro = '1300') {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const queryUrl = `${url}${url.includes('?') ? '&' : '?'}action=getAnalytics&centro=${encodeURIComponent(centro)}&_t=${Date.now()}`;
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al obtener analítica del Centro ${centro} (HTTP ${response.status})`);
    }

    let data = await this.parseJsonResponse(response);

    if (data && data.success && data.totalItems === 0) {
      try {
        const altUrl = `${url}${url.includes('?') ? '&' : '?'}action=getAnalytics&centro=${encodeURIComponent(centro + ' (1)')}&_t=${Date.now()}`;
        const altRes = await fetch(altUrl, { method: 'GET', headers: { 'Accept': 'application/json' }, redirect: 'follow' });
        if (altRes.ok) {
          const altData = await this.parseJsonResponse(altRes);
          if (altData && altData.success && altData.totalItems > 0) {
            data = altData;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    return this.normalizeAnalytics(data, centro);
  }

  /**
   * Normalize analytics data structure across Google Sheets and Excel
   */
  normalizeAnalytics(raw, centro) {
    if (!raw) return null;
    const totalItems = raw.totalItems || 0;
    const countedItems = raw.countedItems !== undefined ? raw.countedItems : (raw.countedCount || 0);
    const pendingItems = raw.pendingItems !== undefined ? raw.pendingItems : (raw.pendingCount !== undefined ? raw.pendingCount : Math.max(0, totalItems - countedItems));
    const exactMatches = raw.exactMatches !== undefined ? raw.exactMatches : (raw.withoutVarianceCount || 0);

    const rawDiscrepancies = raw.topDiscrepancies || raw.topVariances || [];
    const topDiscrepancies = rawDiscrepancies.map(d => ({
      sku: d.sku || '',
      description: d.description || '',
      location: d.location || '',
      systemStock: Number(d.systemStock) || 0,
      physicalStock: Number(d.physicalStock) || 0,
      variance: Number(d.variance) || 0,
      unitCost: Number(d.unitCost) || 0,
      varianceCost: Number(d.varianceCost) || 0,
      status: d.status || (Number(d.variance) < 0 ? 'Faltante' : (Number(d.variance) > 0 ? 'Sobrante' : 'Exacto'))
    }));

    let missingItems = raw.missingItems;
    let surplusItems = raw.surplusItems;
    if (missingItems === undefined || surplusItems === undefined) {
      let missing = 0;
      let surplus = 0;
      topDiscrepancies.forEach(d => {
        if (d.variance < 0) missing++;
        else if (d.variance > 0) surplus++;
      });
      missingItems = missing;
      surplusItems = surplus;
    }

    const iraPercentage = raw.iraPercentage !== undefined ? Number(raw.iraPercentage) : (raw.iraPercent !== undefined ? Number(raw.iraPercent) : (countedItems > 0 ? Number(((exactMatches / countedItems) * 100).toFixed(1)) : 100.0));
    const cycleProgress = raw.cycleProgress !== undefined ? Number(raw.cycleProgress) : (raw.progressPercent !== undefined ? Number(raw.progressPercent) : (totalItems > 0 ? Number(((countedItems / totalItems) * 100).toFixed(1)) : 0.0));
    const netVarianceCost = raw.netVarianceCost !== undefined ? Number(raw.netVarianceCost) : (raw.netVarianceValue !== undefined ? Number(raw.netVarianceValue) : 0);
    const absoluteVarianceCost = raw.absoluteVarianceCost !== undefined ? Number(raw.absoluteVarianceCost) : (raw.absoluteVarianceValue !== undefined ? Number(raw.absoluteVarianceValue) : 0);

    const rawAbc = raw.abcStats || raw.abcBreakdown || {};
    const abcStats = {
      A: { total: rawAbc.A?.total || 0, counted: rawAbc.A?.counted || 0, exact: rawAbc.A?.exact || 0, discrepancies: rawAbc.A?.discrepancies !== undefined ? rawAbc.A?.discrepancies : (rawAbc.A?.variance || 0) },
      B: { total: rawAbc.B?.total || 0, counted: rawAbc.B?.counted || 0, exact: rawAbc.B?.exact || 0, discrepancies: rawAbc.B?.discrepancies !== undefined ? rawAbc.B?.discrepancies : (rawAbc.B?.variance || 0) },
      C: { total: rawAbc.C?.total || 0, counted: rawAbc.C?.counted || 0, exact: rawAbc.C?.exact || 0, discrepancies: rawAbc.C?.discrepancies !== undefined ? rawAbc.C?.discrepancies : (rawAbc.C?.variance || 0) }
    };

    return {
      success: true,
      centro: String(centro || raw.centro || '1300'),
      sheetName: raw.sheetName || String(centro || '1300'),
      totalItems,
      countedItems,
      pendingItems,
      exactMatches,
      missingItems,
      surplusItems,
      iraPercentage,
      cycleProgress,
      netVarianceCost,
      absoluteVarianceCost,
      abcStats,
      topDiscrepancies
    };
  }

  /**
   * Update count of a SKU in Google Sheets
   */
  async updateItemCount(webAppUrl, countData) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const payload = {
      action: 'updateCount',
      centro: countData.centro || '1300',
      sku: countData.sku,
      physicalStock: countData.physicalStock,
      damagedStock: countData.damagedStock || 0,
      locationString: countData.locationString || '',
      counterName: countData.counterName || countData.operatorName || 'Auxiliar',
      notes: countData.notes || ''
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al actualizar conteo en Google Sheets (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Fetch reference photo for an item SKU from Google Drive (nibol/ciclicos/fotosreferencias)
   */
  async getReferencePhoto(webAppUrl, sku) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');
    if (!sku) return { success: false, error: 'SKU no especificado' };

    const queryUrl = `${url}${url.includes('?') ? '&' : '?'}action=getReferencePhoto&sku=${encodeURIComponent(sku)}&_t=${Date.now()}`;
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al consultar foto de referencia (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Upload damaged item evidence photo to Google Drive (Nibol/fotos/[Fecha_Inicio]/[SKU].jpg)
   */
  async uploadDamagedPhoto(webAppUrl, photoData) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const payload = {
      action: 'uploadDamagedPhoto',
      centro: photoData.centro || '1300',
      sku: photoData.sku,
      sessionDate: photoData.sessionDate || photoData.date || new Date().toISOString().substring(0, 10),
      date: photoData.date || new Date().toISOString().substring(0, 10),
      fileName: photoData.fileName,
      fileBase64: photoData.fileBase64,
      mimeType: photoData.mimeType || 'image/jpeg'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al subir foto de mal estado a Google Drive (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Reset count cycle in Google Sheets
   */
  async resetCycle(webAppUrl, centro, filter = {}) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const payload = {
      action: 'resetCycle',
      centro: centro || '1300',
      location: filter.location || '',
      abcClass: filter.abcClass || ''
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al reiniciar ciclo en Google Sheets (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Record digital signature & conclusion in Google Sheets
   */
  async concludeCycle(webAppUrl, conclusionData) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const payload = {
      action: 'concludeCycle',
      ...conclusionData
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al registrar conclusión en Google Sheets (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }

  /**
   * Finish verification & justifications review, exporting snapshot to Google Drive Nibol/ciclicos
   */
  async finishJustificationsReview(webAppUrl, reviewData) {
    const url = this.cleanUrl(webAppUrl);
    if (!url) throw new Error('URL de Google Apps Script no configurada');

    const payload = {
      action: 'finishReview',
      ...reviewData
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Error al finalizar revisión en Google Sheets / Drive (HTTP ${response.status})`);
    }

    return await this.parseJsonResponse(response);
  }
}

module.exports = new GoogleSheetService();
