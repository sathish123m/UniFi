/**
 * ProtectedRoute — Multi-layer auth & role guard
 *
 * Layer 1: Token presence  → redirect to /auth with ?redirect=<original>
 * Layer 2: User hydration  → show loading skeleton until user object resolves
 * Layer 3: Role whitelist  → redirect to own portal if role doesn't match segment
 *
 * Design: O(1) Set lookup for role membership, stores redirect intent in
 * location state so AuthPage can bounce back after login without losing the URL.
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ROLE_HOME = {
  BORROWER: '/borrower/overview',
  PROVIDER: '/provider/overview',
  SUPER_ADMIN: '/admin/overview',
  MOD_ADMIN: '/admin/overview',
  FINANCE_ADMIN: '/admin/overview',
}

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'])

/**
 * @param {string[]}  allowedRoles  - Roles that may enter this subtree.
 *                                    Omit for generic auth-only guard.
 * @param {boolean}   adminGroup    - If true, accepts any admin role variant.
 */
export default function ProtectedRoute({ children, allowedRoles, adminGroup = false }) {
  const { user, accessToken } = useAuth()
  const location = useLocation()

  // ── Layer 1: token must exist ────────────────────────────────────────────
  if (!accessToken) {
    return (
      <Navigate
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  // ── Layer 2: wait for user hydration ────────────────────────────────────
  if (!user) {
    return (
      <div className="center-screen">
        <div className="portal-loading-spinner" />
        <span style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading portal…</span>
      </div>
    )
  }

  // ── Layer 3: role enforcement ────────────────────────────────────────────
  if (allowedRoles) {
    const allowed = new Set(allowedRoles)
    const roleAllowed = adminGroup
      ? ADMIN_ROLES.has(user.role)
      : allowed.has(user.role)

    if (!roleAllowed) {
      // Silently redirect to the user's own home — no error flash
      const home = ROLE_HOME[user.role] || '/auth'
      return <Navigate to={home} replace />
    }
  }

  return children
}
