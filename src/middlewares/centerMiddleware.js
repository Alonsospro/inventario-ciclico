function restrictCenter(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'No autenticado.' });
  }

  const requestedCenter = (req.params && req.params.center) ||
                          (req.body && req.body.center) ||
                          (req.query && req.query.center) || null;

  // Admin and Superadmin have global center access
  if (req.user.isSuperadmin || req.user.role === 'ADMIN') {
    req.targetCenter = requestedCenter;
    return next();
  }

  // Non-admins are strictly tied to their assigned center
  const userCenter = req.user.center || 'WARNES';

  if (requestedCenter && requestedCenter.toUpperCase() !== userCenter.toUpperCase() && requestedCenter !== 'ALL' && requestedCenter !== 'TODOS') {
    return res.status(403).json({
      success: false,
      message: `Acceso restringido al centro ${userCenter}. No puede operar en ${requestedCenter}.`
    });
  }

  req.targetCenter = userCenter;
  next();
}

module.exports = {
  restrictCenter
};
