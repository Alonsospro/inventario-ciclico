const fs = require('fs');
const path = require('path');
const config = require('../config');

class StoragePath {
  constructor() {
    this.baseDir = config.baseDataDir;
    this.memoryStore = new Map();
    this.dirListings = new Map();
    this.isReadOnly = false;
    this.ensureDirs();
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
          // In read-only serverless environments like Vercel, mark as read-only and continue
          this.isReadOnly = true;
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
    const normalized = path.normalize(filePath);
    if (this.memoryStore.has(normalized)) {
      return JSON.parse(JSON.stringify(this.memoryStore.get(normalized)));
    }
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.memoryStore.set(normalized, parsed);
        return JSON.parse(JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn(`[storagePath] Note reading JSON from ${filePath}:`, err.message);
    }
    return defaultValue;
  }

  writeJson(filePath, data) {
    const normalized = path.normalize(filePath);
    const cloned = JSON.parse(JSON.stringify(data));
    this.memoryStore.set(normalized, cloned);

    const dir = path.dirname(normalized);
    const fileName = path.basename(normalized);
    if (!this.dirListings.has(dir)) {
      this.dirListings.set(dir, new Set());
    }
    this.dirListings.get(dir).add(fileName);

    if (!this.isReadOnly) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(cloned, null, 2), 'utf8');
      } catch (err) {
        if (err.code === 'EROFS' || err.code === 'EACCES' || (err.message && err.message.includes('read-only'))) {
          this.isReadOnly = true;
        } else {
          console.warn(`[storagePath] Notice persisting ${filePath}:`, err.message);
        }
      }
    }
    return true;
  }

  listFiles(dirPath) {
    const normalized = path.normalize(dirPath);
    const set = new Set();

    try {
      if (fs.existsSync(normalized)) {
        const diskFiles = fs.readdirSync(normalized);
        diskFiles.forEach(f => set.add(f));
      }
    } catch (e) {}

    if (this.dirListings.has(normalized)) {
      this.dirListings.get(normalized).forEach(f => set.add(f));
    }

    for (const key of this.memoryStore.keys()) {
      if (path.dirname(key) === normalized) {
        set.add(path.basename(key));
      }
    }

    return Array.from(set);
  }

  deleteFile(filePath) {
    const normalized = path.normalize(filePath);
    this.memoryStore.delete(normalized);

    const dir = path.dirname(normalized);
    const fileName = path.basename(normalized);
    if (this.dirListings.has(dir)) {
      this.dirListings.get(dir).delete(fileName);
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
