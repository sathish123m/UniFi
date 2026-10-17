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
import { ROLE_HOME, ADMIN_ROLES } from '../lib/roles'

/**
 * @param {string[]}  allowedRoles  - Roles that may enter this subtree.
 *                                    Omit for generic auth-only guard.
 * @param {boolean}   adminGroup    - If true, accepts any admin role variant.
 */
export default function ProtectedRoute({ children, allowedRoles, adminGroup = false }) {
  const { user, accessToken, bootstrapping } = useAuth()
  const location = useLocation()

  // ── Layer 0: still resolving a persisted session on first load ───────────
  if (bootstrapping) {
    return (
      <div className="center-screen">
        <div className="portal-loading-spinner" />
        <span style={{ marginTop: 14, fontSize: 14, color: '#64748b' }}>Loading portal…</span>
      </div>
    )
  }

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

  // ── Layer 2: token present but user could not be hydrated → re-auth ──────
  // (Previously this rendered a spinner forever when the stored user was
  // missing or a refresh returned no user object.)
  if (!user) {
    return (
      <Navigate
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  // ── Layer 3: role enforcement ────────────────────────────────────────────
  // Applied whenever a role scope is declared: either an explicit allow-list or
  // the adminGroup shorthand. (Borrower/provider guards pass allowedRoles;
  // the /admin tree passes adminGroup only.)
  if (allowedRoles || adminGroup) {
    const allowed = new Set(allowedRoles || [])
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
