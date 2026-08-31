const express = require('express');
const router = express.Router();
const inventoryService = require('../services/inventoryService');
const { authenticate } = require('../middlewares/authMiddleware');
const { restrictCenter } = require('../middlewares/centerMiddleware');

// GET /api/barrido/search
router.get('/search', authenticate, restrictCenter, (req, res) => {
  try {
    const { q, center } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, message: 'Debe ingresar un código de barras o SKU' });
    }

    const targetCenter = req.user.role === 'ADMIN' ? (center || req.user.center) : req.user.center;
    const result = inventoryService.searchProductForBarrido({
      barcodeOrSku: q,
      center: targetCenter
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/barrido/count
router.post('/count', authenticate, restrictCenter, (req, res) => {
  try {
    const {
      inventoryId,
      sku,
      itemId,
      stockFisico,
      malEstado,
      location,
      isNewLocation,
      reason
    } = req.body;

    const targetInvId = inventoryId || `INV-BARRIDO-${req.user.center}-001`;

    const result = inventoryService.updateCount({
      inventoryId: targetInvId,
      itemId,
      sku,
      stockFisico,
      malEstado: malEstado || 0,
      location,
      isNewLocation: !!isNewLocation,
      user: req.user,
      reason: reason || 'Registro desde Escáner Barrido'
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/barrido/finish
router.post('/finish', authenticate, restrictCenter, (req, res) => {
  try {
    const { inventoryId, signature } = req.body;
    const targetInvId = inventoryId || `INV-BARRIDO-${req.user.center}-001`;

    const result = inventoryService.submitInventoryForReview({
      inventoryId: targetInvId,
      user: req.user,
      signature: signature || `Barrido finalizado por ${req.user.username}`
    });

    res.json({
      success: true,
      message: 'Barrido finalizado y enviado a revisión de justificaciones.',
      inventory: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
