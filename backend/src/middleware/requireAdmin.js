function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ success: false, message: 'Administrator access required' });
  }
  return next();
}

module.exports = { requireAdmin };
