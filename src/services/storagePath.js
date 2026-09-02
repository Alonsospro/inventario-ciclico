const fs = require('fs');
const path = require('path');
const config = require('../config');

class StoragePath {
  constructor() {
    this.baseDir = config.baseDataDir;
    this.memoryStore = new Map();
    this.dirListings = new Map();
    this.ensureDirs();
  }

  normalizeKey(p) {
    if (!p) return '';
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  clearMemory() {
    this.memoryStore.clear();
    this.dirListings.clear();
  }

  ensureDirs() {
    const dirs = [
      this.baseDir,
      this.getDataDirectory(),
      this.getPhotosDirectory(),
      this.getReferencePhotosDirectory(),
      this.getInventoriesDirectory(),
      this.getJustificationsDirectory(),
      this.getHistoryDirectory(),
      this.getAuditDirectory()
    ];

    dirs.forEach(dir => {
      if (dir && typeof dir === 'string' && !dir.startsWith('http://') && !dir.startsWith('https://')) {
        try {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        } catch (err) {
          // In read-only cloud environments, directory creation fails gracefully
        }
      }
    });
  }

  getDataDirectory() {
    return this.baseDir;
  }

  getPhotosDirectory() {
    return path.join(this.baseDir, 'photos');
  }

  getReferencePhotosDirectory() {
    const configured = config.referencePhotosDir;
    if (configured && typeof configured === 'string' && !configured.startsWith('http://') && !configured.startsWith('https://')) {
      return configured;
    }
    return path.join(this.baseDir, 'fotosreferencias');
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
    const key = this.normalizeKey(filePath);
    if (this.memoryStore.has(key)) {
      return JSON.parse(JSON.stringify(this.memoryStore.get(key)));
    }
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.memoryStore.set(key, parsed);
        return JSON.parse(JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn(`[storagePath] Note reading JSON from ${filePath}:`, err.message);
    }
    return defaultValue;
  }

  writeJson(filePath, data) {
    const key = this.normalizeKey(filePath);
    const cloned = JSON.parse(JSON.stringify(data));
    this.memoryStore.set(key, cloned);

    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const dirKey = this.normalizeKey(dir);
    if (!this.dirListings.has(dirKey)) {
      this.dirListings.set(dirKey, new Set());
    }

    const set = this.dirListings.get(dirKey);
    const targetLower = fileName.toLowerCase();
    for (const item of set) {
      if (item.toLowerCase() === targetLower) {
        set.delete(item);
      }
    }
    set.add(fileName);

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(cloned, null, 2), 'utf8');
    } catch (err) {
      // In read-only cloud/serverless environments, file is safely cached in memory
    }
    return true;
  }

  listFiles(dirPath) {
    const dirKey = this.normalizeKey(dirPath);
    const fileMap = new Map();

    // 1. Files from disk (case-preserving, deduplicated)
    try {
      if (fs.existsSync(dirPath)) {
        const diskFiles = fs.readdirSync(dirPath);
        diskFiles.forEach(f => {
          fileMap.set(f.toLowerCase(), f);
        });
      }
    } catch (e) {}

    // 2. Files from memory listings
    if (this.dirListings.has(dirKey)) {
      this.dirListings.get(dirKey).forEach(f => {
        fileMap.set(f.toLowerCase(), f);
      });
    }

    return Array.from(fileMap.values());
  }

  deleteFile(filePath) {
    const key = this.normalizeKey(filePath);
    this.memoryStore.delete(key);

    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const dirKey = this.normalizeKey(dir);
    if (this.dirListings.has(dirKey)) {
      const set = this.dirListings.get(dirKey);
      const targetLower = fileName.toLowerCase();
      for (const item of set) {
        if (item.toLowerCase() === targetLower) {
          set.delete(item);
        }
      }
    }

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {}
    return true;
  }
}

const storagePathInstance = new StoragePath();
module.exports = storagePathInstance;
