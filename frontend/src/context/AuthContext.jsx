import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

const STORAGE_KEY = 'unifi_auth_v1'

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeStored = (value) => {
  if (!value) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }
}

export const AuthProvider = ({ children }) => {
  const initial = readStored()
  const [accessToken, setAccessToken] = useState(initial?.accessToken || '')
  const [refreshToken, setRefreshToken] = useState(initial?.refreshToken || '')
  const [user, setUser] = useState(initial?.user || null)
  const [loading, setLoading] = useState(false)

  const setSession = (session) => {
    if (!session) {
      clearSession()
      return
    }
    const at = session.accessToken || ''
    const rt = session.refreshToken || ''
    const u = session.user || null

    setAccessToken(at)
    setRefreshToken(rt)
    setUser(u)
    writeStored({ accessToken: at, refreshToken: rt, user: u })
  }

  const clearSession = () => {
    setAccessToken('')
    setRefreshToken('')
    setUser(null)
    writeStored(null)
  }

  // Listen to cross-tab storage changes and API interceptor auth updates
  useEffect(() => {
    const handleAuthUpdate = (e) => {
      if (e.detail) {
        setAccessToken(e.detail.accessToken || '')
        setRefreshToken(e.detail.refreshToken || '')
        setUser(e.detail.user || null)
      }
    }

    const handleAuthClear = () => {
      clearSession()
    }

    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY) {
        const updated = readStored()
        if (!updated) {
          clearSession()
        } else {
          setAccessToken(updated.accessToken || '')
          setRefreshToken(updated.refreshToken || '')
          setUser(updated.user || null)
        }
      }
    }

    window.addEventListener('unifi_auth_update', handleAuthUpdate)
    window.addEventListener('unifi_auth_clear', handleAuthClear)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('unifi_auth_update', handleAuthUpdate)
      window.removeEventListener('unifi_auth_clear', handleAuthClear)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // On initial load, attempt token refresh if refreshToken exists to ensure fresh session
  useEffect(() => {
    const hydrateSession = async () => {
      const stored = readStored()
      if (stored?.refreshToken && !stored?.accessToken) {
        try {
          const res = await api.post('/auth/refresh', { refreshToken: stored.refreshToken })
          if (res?.data) {
            setSession(res.data)
          }
        } catch {
          clearSession()
        }
      }
    }
    hydrateSession()
  }, [])

  const register = async (payload) => {
    setLoading(true)
    try {
      return await api.post('/auth/register', payload)
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (payload) => {
    setLoading(true)
    try {
      return await api.post('/auth/verify-otp', payload)
    } finally {
      setLoading(false)
    }
  }

  const resendOtp = async (email, requestedRole, purpose = 'EMAIL_VERIFY') => {
    setLoading(true)
    try {
      return await api.post('/auth/resend-otp', { email, purpose, requestedRole })
    } finally {
      setLoading(false)
    }
  }

  const login = async (payload) => {
    setLoading(true)
    try {
      const response = await api.post('/auth/login', payload)
      setSession(response.data)
      return response
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    if (!refreshToken) return false
    try {
      const response = await api.post('/auth/refresh', { refreshToken })
      setSession(response.data)
      return response.data
    } catch {
      clearSession()
      return false
    }
  }

  const me = async () => {
    if (!accessToken && !refreshToken) return null
    try {
      const response = await api.get('/auth/me', accessToken)
      setUser(response.data)
      return response.data
    } catch {
      const refreshed = await refresh()
      if (!refreshed) return null
      const response = await api.get('/auth/me', refreshed.accessToken)
      setUser(response.data)
      return response.data
    }
  }

  const logout = async () => {
    try {
      if (accessToken && refreshToken) {
        await api.post('/auth/logout', { refreshToken }, accessToken)
      }
    } finally {
      clearSession()
    }
  }

  const forgotPassword = async (payload) => {
    setLoading(true)
    try {
      return await api.post('/auth/forgot-password', payload)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (payload) => {
    setLoading(true)
    try {
      return await api.post('/auth/reset-password', payload)
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      loading,
      register,
      verifyOtp,
      resendOtp,
      login,
      logout,
      me,
      refresh,
      clearSession,
      forgotPassword,
      resetPassword,
    }),
    [user, accessToken, refreshToken, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
