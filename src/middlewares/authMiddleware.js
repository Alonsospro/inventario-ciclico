const authService = require('../services/authService');

function authenticate(req, res, next) {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Acceso no autorizado. Se requiere inicio de sesión.'
    });
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      message: 'Sesión expirada o token inválido.'
    });
  }

  req.user = payload;
  next();
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado.'
      });
    }

    if (req.user.isSuperadmin || req.user.role === 'ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere uno de los roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
