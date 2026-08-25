const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');

// ============================================================================
// 🔗 ENLACE DIRECTO DE GOOGLE SHEETS (APPS SCRIPT)
// Pega aquí la URL de tu Google Apps Script Web App (terminada en /exec)
// o configúrala en las variables de entorno como GOOGLE_SHEET_URL.
// ============================================================================
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || 'https://script.google.com/macros/s/AKfycb.../exec';

const DEFAULT_CONFIG = {
  activeFilePath: storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx'),
  activeSheetName: '1300',
  operatorName: 'Supervisor Almacén',
  blindCount: false,
  autoBackup: true,
  varianceThreshold: 0,
  googleSheetUrl: GOOGLE_SHEET_URL,
  syncMode: 'google_sheets', // Modo predeterminado directo a Google Sheets
  columnMapping: {
    sku: 'A',
    barcode: 'B',
    description: 'C',
    location: 'D',
    category: 'E',
    abcClass: 'F',
    unit: 'G',
    unitCost: 'H',
    systemStock: 'I',
    physicalStock: 'J',
    variance: 'K',
    varianceCost: 'L',
    lastCountDate: 'M',
    counterName: 'N',
    status: 'O'
  }
};

class ConfigService {
  constructor() {
    this.configFile = storagePath.getDataFilePath('config.json');
    storagePath.ensureDataDirectory();
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf8');
        const loaded = JSON.parse(raw);
        // Ensure activeFilePath points to the current environment's data directory if it's the default file
        if (loaded.activeFilePath && path.basename(loaded.activeFilePath) === 'CICLICOS NIBOL MULTIMARCAS.xlsx') {
          loaded.activeFilePath = storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx');
        }
        return {
          ...DEFAULT_CONFIG,
          ...loaded,
          googleSheetUrl: GOOGLE_SHEET_URL || loaded.googleSheetUrl || '',
          syncMode: GOOGLE_SHEET_URL ? 'google_sheets' : (loaded.syncMode || 'google_sheets')
        };
      }
    } catch (err) {
      console.warn('Error reading config file, using defaults:', err.message);
    }
    this.saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(newConfig) {
    try {
      storagePath.ensureDataDirectory();
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      return this.config;
    } catch (err) {
      console.error('Error saving config:', err.message);
      throw err;
    }
  }

  getConfig() {
    return this.config;
  }
}

module.exports = new ConfigService();
