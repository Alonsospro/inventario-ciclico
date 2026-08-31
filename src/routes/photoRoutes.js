const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const driveService = require('../services/driveService');
const { authenticate } = require('../middlewares/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// POST /api/photos/upload
router.post('/upload', authenticate, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se envió ningún archivo de imagen' });
    }

    const saved = driveService.savePhotoFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    res.json({
      success: true,
      message: 'Foto cargada correctamente como binario real',
      photo: saved
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/photos/:filename (Serve real binary image)
router.get('/:filename', (req, res) => {
  const filePath = driveService.getPhotoPath(req.params.filename);
  if (!filePath) {
    return res.status(404).json({ success: false, message: 'Imagen no encontrada' });
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'image/jpeg';
  if (ext === '.png') contentType = 'image/png';
  if (ext === '.webp') contentType = 'image/webp';
  if (ext === '.gif') contentType = 'image/gif';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

module.exports = router;
