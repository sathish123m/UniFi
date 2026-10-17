/**
 * roles.js — Single source of truth for role constants.
 *
 * Kept in its own module (rather than exported from App.jsx) so route
 * guards, redirects, and pages can import it without creating a circular
 * dependency with the App component tree.
 */

// Role → post-login home route.
export const ROLE_HOME = {
  BORROWER: '/borrower/overview',
  PROVIDER: '/provider/overview',
  SUPER_ADMIN: '/admin/overview',
  MOD_ADMIN: '/admin/overview',
  FINANCE_ADMIN: '/admin/overview',
}

// Roles that share the admin portal.
export const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'])
