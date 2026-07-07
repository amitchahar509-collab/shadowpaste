// @shadowpaste/rbac — pure role-based access-control policy engine (V14 Phase 4).
// This is ONLY the policy layer: it decides whether a role may perform an action.
// It does NOT provide authentication, user storage, sessions, or a team database —
// those require a real backend and are not implemented. Compose this with your auth.

export const ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];

// Permission catalogue mapped to the ShadowPaste feature surface.
export const PERMISSIONS = [
  'secret.create', 'secret.use', 'secret.rotate', 'secret.revoke', 'secret.delete',
  'ai.approve_high_risk', 'audit.export', 'team.invite', 'team.remove', 'team.set_role', 'billing.manage'
];

// Role → allowed permissions. Higher roles are supersets, but expressed explicitly
// so the matrix is auditable rather than implied by ordering.
const MATRIX = {
  OWNER: new Set(PERMISSIONS),
  ADMIN: new Set(['secret.create', 'secret.use', 'secret.rotate', 'secret.revoke', 'secret.delete',
    'ai.approve_high_risk', 'audit.export', 'team.invite', 'team.remove', 'team.set_role']),
  DEVELOPER: new Set(['secret.create', 'secret.use', 'secret.rotate']),
  VIEWER: new Set([]) // read-only: can view metadata (implicit), no mutating/using powers
};

export function can(role, permission) {
  const set = MATRIX[role];
  return !!set && set.has(permission);
}

/** Enforce a permission; returns {ok} or {ok:false, reason} — never throws for a denial. */
export function enforce(role, permission) {
  if (!ROLES.includes(role)) return { ok: false, reason: `unknown role: ${role}` };
  if (!PERMISSIONS.includes(permission)) return { ok: false, reason: `unknown permission: ${permission}` };
  return can(role, permission) ? { ok: true } : { ok: false, reason: `${role} lacks ${permission}` };
}

/** Full capability listing for a role (for building a UI). */
export function permissionsFor(role) {
  return [...(MATRIX[role] || [])];
}

/** Role-change guard: only OWNER/ADMIN may set roles, and no one may create a second OWNER via set_role. */
export function canSetRole(actorRole, targetNewRole) {
  if (!can(actorRole, 'team.set_role')) return { ok: false, reason: `${actorRole} cannot change roles` };
  if (targetNewRole === 'OWNER') return { ok: false, reason: 'OWNER must be transferred explicitly, not assigned' };
  return { ok: true };
}

export default { ROLES, PERMISSIONS, can, enforce, permissionsFor, canSetRole };
