const fs = require('fs');
const path = require('path');
const config = require('../config');

class StoragePath {
  constructor() {
    this.baseDir = config.baseDataDir;
    this.ensureDirs();
  }

  ensureDirs() {
    const dirs = [
      this.baseDir,
      this.getDataDirectory(),
      this.getPhotosDirectory(),
      this.getInventoriesDirectory(),
      this.getJustificationsDirectory(),
      this.getHistoryDirectory(),
      this.getAuditDirectory()
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  getDataDirectory() {
    return this.baseDir;
  }

  getPhotosDirectory() {
    return path.join(this.baseDir, 'photos');
  }

  getInventoriesDirectory() {
    return path.join(this.baseDir, 'inventories');
  }

  getJustificationsDirectory() {
    return path.join(this.baseDir, 'justifications');
  }

  getHistoryDirectory() {
    return path.join(this.baseDir, 'history');
  }

  getAuditDirectory() {
    return path.join(this.baseDir, 'audit');
  }

  getUsersFilePath() {
    return path.join(this.baseDir, 'users.json');
  }

  readJson(filePath, defaultValue = null) {
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[storagePath] Error reading JSON from ${filePath}:`, err.message);
      return defaultValue;
    }
  }

  writeJson(filePath, data) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`[storagePath] Error writing JSON to ${filePath}:`, err.message);
      throw err;
    }
  }
}

const storagePathInstance = new StoragePath();
module.exports = storagePathInstance;
