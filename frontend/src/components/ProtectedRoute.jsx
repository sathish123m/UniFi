import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return children
}
