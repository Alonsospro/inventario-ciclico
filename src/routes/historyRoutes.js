const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const storagePath = require('../services/storagePath');
const { authenticate } = require('../middlewares/authMiddleware');
const { restrictCenter } = require('../middlewares/centerMiddleware');

// GET /api/history (List finalized inventories)
router.get('/', authenticate, restrictCenter, (req, res) => {
  try {
    const historyDir = storagePath.getHistoryDirectory();
    const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
    const list = [];

    files.forEach(f => {
      const record = storagePath.readJson(path.join(historyDir, f), null);
      if (!record) return;

      if (req.user.role !== 'ADMIN' && !req.user.isSuperadmin) {
        if (record.center !== req.user.center) return;
      }

      list.push({
        fileId: record.fileId,
        fileName: record.fileName,
        logicalPath: record.logicalPath,
        inventoryId: record.inventoryId,
        type: record.type,
        center: record.center,
        closedBy: record.closedBy,
        closedAt: record.closedAt,
        totalItems: record.totalItems,
        justificationsCount: record.justificationsCount,
        driveUrl: `https://drive.google.com/drive/folders/nibol-${record.center.toLowerCase()}-${record.type.toLowerCase()}`
      });
    });

    res.json({
      success: true,
      history: list.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/history/:fileId (Detail)
router.get('/:fileId', authenticate, (req, res) => {
  try {
    const historyDir = storagePath.getHistoryDirectory();
    const filePath = path.join(historyDir, `${req.params.fileId}.json`);
    const record = storagePath.readJson(filePath, null);

    if (!record) {
      return res.status(404).json({ success: false, message: 'Registro histórico no encontrado' });
    }

    if (req.user.role !== 'ADMIN' && !req.user.isSuperadmin && record.center !== req.user.center) {
      return res.status(403).json({ success: false, message: 'Acceso denegado a registros de otro centro' });
    }

    res.json({ success: true, record });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/history/:fileId/download (Export CSV representation)
router.get('/:fileId/download', authenticate, (req, res) => {
  try {
    const historyDir = storagePath.getHistoryDirectory();
    const filePath = path.join(historyDir, `${req.params.fileId}.json`);
    const record = storagePath.readJson(filePath, null);

    if (!record) {
      return res.status(404).send('Registro no encontrado');
    }

    // Generate standard CSV with all 16 columns A to P
    const headers = [
      'SKU', 'Codigo_Barras', 'Descripcion', 'Ubicacion', 'Categoria',
      'Clasificacion_ABC', 'Unidad', 'Costo_Unitario', 'Stock_Sistema',
      'Stock_Fisico', 'Diferencia', 'Costo_Diferencia', 'Fecha_Ultimo_Conteo',
      'Responsable', 'Estado', 'Mal_estado'
    ];

    let csvContent = '\uFEFF' + headers.join(',') + '\n';

    (record.items || []).forEach(it => {
      const row = [
        `"${it.SKU || ''}"`,
        `"${it.Codigo_Barras || ''}"`,
        `"${(it.Descripcion || '').replace(/"/g, '""')}"`,
        `"${it.Ubicacion || ''}"`,
        `"${it.Categoria || ''}"`,
        `"${it.Clasificacion_ABC || ''}"`,
        `"${it.Unidad || ''}"`,
        it.Costo_Unitario || 0,
        it.Stock_Sistema || 0,
        it.Stock_Fisico !== null ? it.Stock_Fisico : '',
        it.Diferencia || 0,
        it.Costo_Diferencia || 0,
        `"${it.Fecha_Ultimo_Conteo || ''}"`,
        `"${it.Responsable || ''}"`,
        `"${it.Estado || ''}"`,
        it.Mal_estado || 0
      ];
      csvContent += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${record.fileName.replace('.xlsx', '.csv')}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Error exportando reporte: ' + err.message);
  }
});

module.exports = router;
