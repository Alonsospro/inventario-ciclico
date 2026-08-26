const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');

// ============================================================================
// 🔗 ENLACES DE GOOGLE SHEETS (APPS SCRIPT) PARA CADA TIPO DE INVENTARIO
// ============================================================================
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || 'https://script.google.com/macros/s/AKfycbwpJ5klIWQmhhM4RNgxfG4QabqLOOb2KCVhLPhyIWvHeUsQ39wgHjMt3sHLJo9tH-9p/exec';
const GOOGLE_SHEET_URL_SEMANAL = process.env.GOOGLE_SHEET_URL_SEMANAL || 'https://script.google.com/macros/s/AKfycbxCEDud8PvY4nF31KusgUAa9HJvTwxTzJQsyrfBcPb1cXp4Gg9vJJh_Xo6hQ91DcgnwZw/exec';
const GOOGLE_SHEET_URL_MENSUAL = process.env.GOOGLE_SHEET_URL_MENSUAL || 'https://script.google.com/macros/s/AKfycbyF903sRTv0jkn_nxAFEZogK0cY_sLSMkgJzViImuIgYMaBV_1MSI1hsINhmD43Gro4Cg/exec';
const GOOGLE_SHEET_URL_BARRIDO = process.env.GOOGLE_SHEET_URL_BARRIDO || 'https://script.google.com/macros/s/AKfycbysHHX9TYzpV3jDBvcDtcHmCAc0PO3vRpiivGqHz373qr4aB3mfmmcxjtWXhuemv3FyvQ/exec';

const INVENTORY_TYPES = {
  ciclico: {
    id: 'ciclico',
    name: 'Inventario Cíclico',
    fileTitle: 'CICLICOS NIBOL MULTIMARCAS',
    excelFile: 'CICLICOS NIBOL MULTIMARCAS.xlsx',
    description: 'Conteo rotativo continuo por clasificación ABC',
    icon: 'fa-boxes-stacked',
    color: '#4f46e5',
    badgeClass: 'badge-ciclico'
  },
  semanal: {
    id: 'semanal',
    name: 'Inventario Semanal',
    fileTitle: 'SEMANALES NIBOL MULTIMARCAS',
    excelFile: 'SEMANALES NIBOL MULTIMARCAS.xlsx',
    description: 'Control programado semanal de familias y pasillos',
    icon: 'fa-calendar-week',
    color: '#10b981',
    badgeClass: 'badge-semanal'
  },
  mensual: {
    id: 'mensual',
    name: 'Inventario Mensual',
    fileTitle: 'MENSUALES NIBOL MULTIMARCAS',
    excelFile: 'MENSUALES NIBOL MULTIMARCAS.xlsx',
    description: 'Inventario mensual y balance general de centro',
    icon: 'fa-calendar-days',
    color: '#8b5cf6',
    badgeClass: 'badge-mensual'
  },
  barrido: {
    id: 'barrido',
    name: 'Barrido General',
    fileTitle: 'BARRIDO NIBOL MULTIMARCAS',
    excelFile: 'BARRIDO NIBOL MULTIMARCAS.xlsx',
    description: 'Barrido exhaustivo de pasillos, ubicaciones y stock cero',
    icon: 'fa-broom',
    color: '#f59e0b',
    badgeClass: 'badge-barrido'
  }
};

const DEFAULT_CONFIG = {
  activeFilePath: storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx'),
  activeSheetName: '1300',
  activeInventoryType: 'ciclico',
  operatorName: 'Supervisor Almacén',
  blindCount: false,
  autoBackup: true,
  varianceThreshold: 0,
  googleSheetUrl: GOOGLE_SHEET_URL,
  googleSheetUrls: {
    ciclico: GOOGLE_SHEET_URL,
    semanal: GOOGLE_SHEET_URL_SEMANAL,
    mensual: GOOGLE_SHEET_URL_MENSUAL,
    barrido: GOOGLE_SHEET_URL_BARRIDO
  },
  syncMode: 'google_sheets',
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
    status: 'O',
    damagedStock: 'P',
    malEstado: 'P'
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
        if (loaded.activeFilePath && path.basename(loaded.activeFilePath) === 'CICLICOS NIBOL MULTIMARCAS.xlsx') {
          loaded.activeFilePath = storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx');
        }

        const mergedUrls = {
          ...DEFAULT_CONFIG.googleSheetUrls,
          ...(loaded.googleSheetUrls || {})
        };
        if (loaded.googleSheetUrl) {
          mergedUrls.ciclico = loaded.googleSheetUrl;
        }

        return {
          ...DEFAULT_CONFIG,
          ...loaded,
          googleSheetUrl: GOOGLE_SHEET_URL || loaded.googleSheetUrl || '',
          googleSheetUrls: mergedUrls,
          syncMode: (GOOGLE_SHEET_URL || loaded.googleSheetUrl) ? 'google_sheets' : (loaded.syncMode || 'google_sheets')
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

  getAllInventoryTypes() {
    return Object.values(INVENTORY_TYPES).map(t => {
      const url = (this.config.googleSheetUrls && this.config.googleSheetUrls[t.id]) || this.config.googleSheetUrl || '';
      return {
        ...t,
        googleSheetUrl: url,
        isConfigured: !!url
      };
    });
  }

  getInventoryTypeMeta(type = 'ciclico') {
    const normalizedType = String(type || 'ciclico').toLowerCase().trim();
    return INVENTORY_TYPES[normalizedType] || INVENTORY_TYPES.ciclico;
  }

  getUrlForType(type = 'ciclico') {
    const normalizedType = String(type || 'ciclico').toLowerCase().trim();
    if (this.config.googleSheetUrls && this.config.googleSheetUrls[normalizedType]) {
      return this.config.googleSheetUrls[normalizedType];
    }
    return this.config.googleSheetUrl || GOOGLE_SHEET_URL;
  }

  getExcelPathForType(type = 'ciclico') {
    const meta = this.getInventoryTypeMeta(type);
    const specificPath = storagePath.getDataFilePath(meta.excelFile);
    if (fs.existsSync(specificPath)) {
      return specificPath;
    }
    return this.config.activeFilePath || storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx');
  }
}

module.exports = new ConfigService();
