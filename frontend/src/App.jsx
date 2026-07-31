/**
 * App.jsx — Uni-Fi Route Tree
 *
 * Architecture: Nested React Router v6 routes with role-scoped subtrees.
 *
 * URL Schema:
 * ──────────────────────────────────────────────────────────────────
 *  /                             Public landing page
 *  /auth                         Login / Register
 *  /auth/reset-password          Password reset flow
 *
 *  /borrower                     → redirect /borrower/overview
 *  /borrower/overview            Dashboard & stats
 *  /borrower/account             Profile & security settings
 *  /borrower/kyc                 KYC 6-step verification
 *  /borrower/borrow              Loan application wizard
 *  /borrower/repay               Repayment center
 *  /borrower/notifications       Campus alerts
 *  /borrower/help                FAQs & support ticket
 *
 *  /provider                     → redirect /provider/overview
 *  /provider/overview            Portfolio dashboard
 *  /provider/account             Profile & security settings
 *  /provider/kyc                 KYC 6-step verification
 *  /provider/provide             Marketplace (fund/decline)
 *  /provider/balance             Wallet, deposits, withdrawals
 *  /provider/notifications       Portfolio alerts
 *  /provider/help                FAQs & support ticket
 *
 *  /admin                        → redirect /admin/overview
 *  /admin/overview               Platform metrics
 *  /admin/accounts               User management + drawer
 *  /admin/kyc                    KYC review queue
 *  /admin/loans                  Loan monitor (force-match)
 *  /admin/defaults               Overdue & defaulters
 *  /admin/disputes               Dispute resolution
 *  /admin/policy                 Policy engine
 *  /admin/audit                  Admin audit log
 *
 *  /portal                       Legacy → SmartRoleRedirect
 *  *                             404 → NotFoundPage
 * ──────────────────────────────────────────────────────────────────
 *
 * Guard layering (defence-in-depth):
 *   1. Token presence    — ProtectedRoute checks accessToken exists
 *   2. User hydration    — ProtectedRoute shows loading until user resolves
 *   3. Role whitelist    — ProtectedRoute.allowedRoles / adminGroup
 *   4. API enforcement   — Backend rejects invalid JWTs at every endpoint
 *
 * Performance:
 *   Eager imports at 309KB / 84KB gzip — acceptable for this scale.
 *   Add React.lazy() + Suspense per panel if bundle exceeds ~600KB gzip.
 */
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './context/AuthContext'

import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import BorrowerPanel from './pages/BorrowerPanel'
import ProviderPanel from './pages/ProviderPanel'
import AdminPanel from './pages/AdminPanel'
import NotFoundPage from './pages/NotFoundPage'

// ── Role → home route map ────────────────────────────────────────────────────
export const ROLE_HOME = {
  BORROWER:      '/borrower/overview',
  PROVIDER:      '/provider/overview',
  SUPER_ADMIN:   '/admin/overview',
  MOD_ADMIN:     '/admin/overview',
  FINANCE_ADMIN: '/admin/overview',
}

export default function App() {
  return (
    <Routes>

      {/* ── PUBLIC ──────────────────────────────────────────────────────── */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/reset-password" element={<AuthPage initialView="reset" />} />

      {/* ── BORROWER PORTAL ─────────────────────────────────────────────── */}
      <Route
        path="/borrower"
        element={
          <ProtectedRoute allowedRoles={['BORROWER']}>
            <BorrowerPanel />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path=":section" element={null} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Route>

      {/* ── PROVIDER PORTAL ─────────────────────────────────────────────── */}
      <Route
        path="/provider"
        element={
          <ProtectedRoute allowedRoles={['PROVIDER']}>
            <ProviderPanel />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path=":section" element={null} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Route>

      {/* ── ADMIN PORTAL ────────────────────────────────────────────────── */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminGroup>
            <AdminPanel />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path=":section" element={null} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Route>

      {/* ── LEGACY /portal ──────────────────────────────────────────────── */}
      {/* Keeps backward-compat with any saved bookmarks to the old /portal URL */}
      <Route
        path="/portal"
        element={
          <ProtectedRoute>
            <SmartRoleRedirect />
          </ProtectedRoute>
        }
      />

      {/* ── 404 ─────────────────────────────────────────────────────────── */}
      <Route path="*" element={<NotFoundPage />} />

    </Routes>
  )
}

/**
 * SmartRoleRedirect
 * Resolves /portal → correct role home.
 * Mounts only inside ProtectedRoute so user is guaranteed to be non-null.
 */
function SmartRoleRedirect() {
  const { user } = useAuth()
  const home = ROLE_HOME[user?.role] || '/auth'
  return <Navigate to={home} replace />
}
