'use strict';

const {
  resolveAdminRouteRule,
  evaluateRoutePermissionAccess,
  forbiddenPermissionResponse,
} = require('../lib/adminRoutePermissions');

/**
 * Phase 2 RBAC guard — runs on every /v1/admin route after requireAdmin.
 * Super admin and implicit-full admins pass via req.hasAdminPermission.
 */
function adminPermissionGuard(req, res, next) {
  if (typeof req.hasAdminPermission !== 'function') {
    return res.status(500).json({ error: 'Admin permission context missing' });
  }
  const rule = resolveAdminRouteRule(req.method, req.path);
  const result = evaluateRoutePermissionAccess(rule, req);
  if (!result.allowed) {
    return forbiddenPermissionResponse(res, result);
  }
  return next();
}

module.exports = { adminPermissionGuard };
