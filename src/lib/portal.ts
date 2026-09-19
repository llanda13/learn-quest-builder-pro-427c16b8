export type PortalRole = 'admin' | 'teacher' | 'validator';

export const PORTAL_ROLES: PortalRole[] = ['admin', 'teacher', 'validator'];

export const PORTAL_HOME: Record<PortalRole, string> = {
  admin: '/admin/dashboard',
  teacher: '/teacher/dashboard',
  validator: '/validator/pending',
};

export const PORTAL_LABEL: Record<PortalRole, string> = {
  admin: 'Administrator Portal',
  teacher: 'Teacher Portal',
  validator: 'Evaluator Portal',
};

const key = (uid: string) => `active-portal:${uid}`;

export function getActivePortal(uid?: string | null): PortalRole | null {
  if (!uid || typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(key(uid));
  return v && (PORTAL_ROLES as string[]).includes(v) ? (v as PortalRole) : null;
}

export function setActivePortal(uid: string, role: PortalRole) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key(uid), role);
}

export function clearActivePortal(uid?: string | null) {
  if (!uid || typeof window === 'undefined') return;
  window.localStorage.removeItem(key(uid));
}

/**
 * Where a signed-in account should land.
 * - no assigned role  → /auth
 * - one assigned role → that portal
 * - several roles     → the last chosen portal, otherwise the portal picker
 *
 * The stored choice is only a UI convenience; it can never widen access
 * because every route is still guarded by the assigned roles themselves.
 */
export function resolveHome(roles: PortalRole[], uid?: string | null): string {
  const assigned = PORTAL_ROLES.filter((r) => roles.includes(r));
  if (assigned.length === 0) return '/auth';
  if (assigned.length === 1) return PORTAL_HOME[assigned[0]];
  const active = getActivePortal(uid);
  if (active && assigned.includes(active)) return PORTAL_HOME[active];
  return '/portal';
}
