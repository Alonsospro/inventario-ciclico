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
        throw new Error('Google Apps Script requiere permisos de acceso: En tu Google Apps Script haz clic en "Implementar" -> "Administrar implementaciones" -> Editar -> Cambia "Quién tiene acceso" a "Cualquier usuario" (Anyone).');
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
   * Get inventory items for a specific Centro
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

    return await this.parseJsonResponse(response);
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

    return await this.parseJsonResponse(response);
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
}

module.exports = new GoogleSheetService();
