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
  if (!value) return localStorage.removeItem(STORAGE_KEY)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export const AuthProvider = ({ children }) => {
  const initial = readStored()
  const [accessToken, setAccessToken] = useState(initial?.accessToken || '')
  const [refreshToken, setRefreshToken] = useState(initial?.refreshToken || '')
  const [user, setUser] = useState(initial?.user || null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accessToken || !refreshToken || !user) {
      writeStored(null)
      return
    }
    writeStored({ accessToken, refreshToken, user })
  }, [accessToken, refreshToken, user])

  const setSession = ({ accessToken: at, refreshToken: rt, user: u }) => {
    setAccessToken(at)
    setRefreshToken(rt)
    setUser(u)
  }

  const clearSession = () => {
    setAccessToken('')
    setRefreshToken('')
    setUser(null)
    writeStored(null)
  }

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

  const resendOtp = async (email, requestedRole) => {
    setLoading(true)
    try {
      return await api.post('/auth/resend-otp', { email, purpose: 'EMAIL_VERIFY', requestedRole })
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
    if (!accessToken) return null
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
