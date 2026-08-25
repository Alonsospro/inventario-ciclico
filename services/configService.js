const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');

const DEFAULT_CONFIG = {
  activeFilePath: storagePath.getDataFilePath('CICLICOS NIBOL MULTIMARCAS.xlsx'),
  activeSheetName: '1300',
  operatorName: 'Supervisor Almacén',
  blindCount: false,
  autoBackup: true,
  varianceThreshold: 0,
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
        return { ...DEFAULT_CONFIG, ...loaded };
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
