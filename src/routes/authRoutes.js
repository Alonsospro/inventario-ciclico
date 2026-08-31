const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { authenticate, requireRole } = require('../middlewares/authMiddleware');

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
    }

    const authResult = authService.authenticate(username, password);
    res.json({
      success: true,
      message: 'Autenticación exitosa',
      ...authResult
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = authService.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
  }
  res.json({ success: true, user });
});

// GET /api/auth/users (Admin / Encargado)
router.get('/users', authenticate, (req, res) => {
  try {
    const users = authService.getAllUsers(req.user);
    res.json({ success: true, users });
  } catch (err) {
    res.status(403).json({ success: false, message: err.message });
  }
});

// POST /api/auth/users (Create user)
router.post('/users', authenticate, requireRole(['ADMIN', 'ENCARGADO']), (req, res) => {
  try {
    const newUser = authService.createUser(req.body, req.user);
    res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/users/:id (Update user)
router.put('/users/:id', authenticate, requireRole(['ADMIN', 'ENCARGADO']), (req, res) => {
  try {
    const updated = authService.updateUser(req.params.id, req.body, req.user);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/auth/users/:id (Superadmin / Admin)
router.delete('/users/:id', authenticate, requireRole(['ADMIN']), (req, res) => {
  try {
    const result = authService.deleteUser(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
