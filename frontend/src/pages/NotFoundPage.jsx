import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_HOME } from '../App'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const home = user ? (ROLE_HOME[user.role] || '/auth') : '/'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f8fa',
      fontFamily: 'Inter, sans-serif',
      textAlign: 'center',
      padding: 32,
    }}>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 88, fontWeight: 700, color: 'rgba(31,41,55,.08)', lineHeight: 1 }}>
        404
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 16, color: '#1f2937' }}>
        Page not found
      </h1>
      <p style={{ color: '#64748b', fontSize: 15, marginTop: 8, maxWidth: 380, lineHeight: 1.6 }}>
        The URL you're looking for doesn't exist or you don't have access to it.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ padding: '12px 22px', borderRadius: 12, border: '1.5px solid rgba(31,41,55,.14)', fontWeight: 700, fontSize: 14, color: '#1f2937', background: 'transparent', cursor: 'pointer' }}
        >
          ← Go back
        </button>
        <button
          onClick={() => navigate(home)}
          style={{ padding: '12px 22px', borderRadius: 12, background: '#1f2937', color: '#fdf3ef', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}
        >
          {user ? 'Back to portal' : 'Go home'} →
        </button>
      </div>
    </div>
  )
}
