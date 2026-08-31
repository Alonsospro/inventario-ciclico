const express = require('express');
const router = express.Router();
const inventoryService = require('../services/inventoryService');
const gasService = require('../services/gasService');
const { authenticate, requireRole } = require('../middlewares/authMiddleware');
const { restrictCenter } = require('../middlewares/centerMiddleware');

// GET /api/inventories (List)
router.get('/', authenticate, restrictCenter, (req, res) => {
  try {
    const { center, type } = req.query;
    const targetCenter = req.user.role === 'ADMIN' ? center : req.user.center;
    const list = inventoryService.getInventories(req.user, targetCenter, type);
    res.json({ success: true, inventories: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/inventories/:id (Detail + Blind count filter for Auxiliar)
router.get('/:id', authenticate, (req, res) => {
  try {
    const inv = inventoryService.getInventoryById(req.params.id, req.user);
    res.json({ success: true, inventory: inv });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// POST /api/inventories (Create new)
router.post('/', authenticate, requireRole(['ADMIN', 'ENCARGADO']), restrictCenter, (req, res) => {
  try {
    const { type, center, name, items } = req.body;
    const targetCenter = req.user.role === 'ADMIN' ? (center || 'WARNES') : req.user.center;
    const newInv = inventoryService.createInventory({
      type,
      center: targetCenter,
      name,
      items,
      user: req.user
    });
    res.status(201).json({ success: true, inventory: newInv });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/inventories/fetch-from-gas (Fetch remote template items from Google Apps Script)
router.post('/fetch-from-gas', authenticate, requireRole(['ADMIN', 'ENCARGADO']), async (req, res) => {
  try {
    const { type, center } = req.body;
    const targetCenter = req.user.role === 'ADMIN' ? (center || 'WARNES') : req.user.center;
    const products = await gasService.fetchProductsFromScript(type, targetCenter);
    res.json({
      success: true,
      message: `Se cargaron ${products.length} productos desde Google Apps Script`,
      products
    });
  } catch (err) {
    // If GAS fails or is unreachable in offline dev, return helpful message without crash
    res.status(200).json({
      success: true,
      fallback: true,
      message: `Aviso de conexión con Google Apps Script: ${err.message}. Puede ingresar ítems manualmente o usar la plantilla local.`,
      products: []
    });
  }
});

// POST /api/inventories/:id/count (Register physical count)
router.post('/:id/count', authenticate, (req, res) => {
  try {
    const { itemId, sku, stockFisico, malEstado, location, isNewLocation, reason } = req.body;

    const result = inventoryService.updateCount({
      inventoryId: req.params.id,
      itemId,
      sku,
      stockFisico,
      malEstado,
      location,
      isNewLocation,
      user: req.user,
      reason
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/inventories/:id/reassign (Reassign items)
router.post('/:id/reassign', authenticate, requireRole(['ADMIN', 'ENCARGADO']), (req, res) => {
  try {
    const { itemIds, toUser, reason } = req.body;
    const result = inventoryService.reassignTasks({
      inventoryId: req.params.id,
      itemIds,
      toUser,
      requestingUser: req.user,
      reason
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/inventories/:id/submit (Submit for review)
router.post('/:id/submit', authenticate, (req, res) => {
  try {
    const { signature } = req.body;
    const result = inventoryService.submitInventoryForReview({
      inventoryId: req.params.id,
      user: req.user,
      signature
    });
    res.json({ success: true, inventory: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/inventories/:id/reopen (Reopen inventory - Admin only)
router.post('/:id/reopen', authenticate, requireRole(['ADMIN']), (req, res) => {
  try {
    const { reason } = req.body;
    const result = inventoryService.reopenInventory({
      inventoryId: req.params.id,
      user: req.user,
      reason
    });
    res.json({ success: true, inventory: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/inventories/:id (Delete inventory with confirmation key - Admin only)
router.delete('/:id', authenticate, requireRole(['ADMIN']), (req, res) => {
  try {
    const { deleteKey, reason } = req.body;
    const result = inventoryService.deleteInventory({
      inventoryId: req.params.id,
      user: req.user,
      deleteKey,
      reason
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
