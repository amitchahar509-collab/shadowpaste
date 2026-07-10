// @shadowpaste/security — RBAC policy engine
// Ported from packages/rbac/index.mjs. Pure policy layer: decides whether a role
// may perform an action. Compose with auth (src/lib/auth.ts).

export const ROLES = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "secret.create", "secret.use", "secret.rotate", "secret.revoke", "secret.delete",
  "ai.approve_high_risk", "audit.export", "team.invite", "team.remove", "team.set_role", "billing.manage",
  "agent.create", "agent.manage", "mcp.invoke", "project.scan", "sandbox.approve",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, Set<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  ADMIN: new Set([
    "secret.create", "secret.use", "secret.rotate", "secret.revoke", "secret.delete",
    "ai.approve_high_risk", "audit.export", "team.invite", "team.remove", "team.set_role",
    "agent.create", "agent.manage", "mcp.invoke", "project.scan", "sandbox.approve",
  ]),
  DEVELOPER: new Set(["secret.create", "secret.use", "secret.rotate", "agent.create", "mcp.invoke", "project.scan"]),
  VIEWER: new Set([] as Permission[]),
};

export function can(role: string, permission: Permission): boolean {
  const set = MATRIX[role as Role];
  return !!set && set.has(permission);
}

export function enforce(role: string, permission: Permission): { ok: boolean; reason?: string } {
  if (!ROLES.includes(role as Role)) return { ok: false, reason: `unknown role: ${role}` };
  if (!PERMISSIONS.includes(permission)) return { ok: false, reason: `unknown permission: ${permission}` };
  return can(role, permission) ? { ok: true } : { ok: false, reason: `${role} lacks ${permission}` };
}

export function permissionsFor(role: string): Permission[] {
  return [...(MATRIX[role as Role] || [])];
}

export function canSetRole(actorRole: string, targetNewRole: string): { ok: boolean; reason?: string } {
  if (!can(actorRole, "team.set_role")) return { ok: false, reason: `${actorRole} cannot change roles` };
  if (targetNewRole === "OWNER") return { ok: false, reason: "OWNER must be transferred explicitly, not assigned" };
  return { ok: true };
}
