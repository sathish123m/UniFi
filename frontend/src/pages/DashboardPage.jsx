import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BorrowerPanel from './BorrowerPanel'
import ProviderPanel from './ProviderPanel'
import AdminPanel from './AdminPanel'

export default function DashboardPage() {
  const { user, me, accessToken, clearSession } = useAuth()

  useEffect(() => {
    if (accessToken && !user) {
      me().catch(() => clearSession())
    }
  }, [accessToken, user, me, clearSession])

  if (!user) return <div className="center-screen">Loading portal...</div>

  if (user.role === 'BORROWER') return <BorrowerPanel />
  if (user.role === 'PROVIDER') return <ProviderPanel />
  if (['SUPER_ADMIN', 'MOD_ADMIN', 'FINANCE_ADMIN'].includes(user.role)) return <AdminPanel />

  return <Navigate to="/auth" replace />
}
