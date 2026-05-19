import { config } from '../config.js';

export function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) {
    return next();
  }

  return res.redirect('/admin/login');
}

export function authenticateAdmin(username, password) {
  return username === config.adminUser && password === config.adminPassword;
}
