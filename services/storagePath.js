const fs = require('fs');
const path = require('path');

const ROOT_DATA_DIR = path.join(__dirname, '..', 'data');
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ACTIVE_DATA_DIR = IS_VERCEL ? path.join('/tmp', 'data') : ROOT_DATA_DIR;

function ensureDataDirectory() {
  if (!fs.existsSync(ACTIVE_DATA_DIR)) {
    fs.mkdirSync(ACTIVE_DATA_DIR, { recursive: true });
  }

  // When running on Vercel / serverless, copy initial seed files from bundle to writable /tmp/data
  if (IS_VERCEL && fs.existsSync(ROOT_DATA_DIR)) {
    try {
      const files = fs.readdirSync(ROOT_DATA_DIR);
      for (const file of files) {
        const src = path.join(ROOT_DATA_DIR, file);
        const dest = path.join(ACTIVE_DATA_DIR, file);
        const stat = fs.statSync(src);
        if (stat.isFile() && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (err) {
      console.warn('Advertencia al copiar archivos semilla a /tmp:', err.message);
    }
  }
}

function getDataFilePath(filename) {
  ensureDataDirectory();
  return path.join(ACTIVE_DATA_DIR, filename);
}

function getDataDirectory() {
  ensureDataDirectory();
  return ACTIVE_DATA_DIR;
}

function getDataDir() {
  ensureDataDirectory();
  return ACTIVE_DATA_DIR;
}

function getUploadsDir() {
  const uploadsDir = path.join(ACTIVE_DATA_DIR, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

module.exports = {
  IS_VERCEL,
  ACTIVE_DATA_DIR,
  ensureDataDirectory,
  getDataFilePath,
  getDataDirectory,
  getDataDir,
  getUploadsDir
};
