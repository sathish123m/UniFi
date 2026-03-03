import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'unifi_theme_pref_v1'

const getSystemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

const readPreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
  } catch {
    return 'system'
  }
  return 'system'
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference)
  const [resolvedTheme, setResolvedTheme] = useState(() => (readPreference() === 'system' ? getSystemTheme() : readPreference()))

  useEffect(() => {
    const applyResolved = () => {
      const next = preference === 'system' ? getSystemTheme() : preference
      setResolvedTheme(next)
      document.documentElement.setAttribute('data-theme', next)
      document.body.setAttribute('data-theme', next)
    }

    applyResolved()

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (preference === 'system') applyResolved()
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // ignore storage errors
    }
  }, [preference])

  const toggleTheme = () => {
    const current = preference === 'system' ? resolvedTheme : preference
    setPreference(current === 'dark' ? 'light' : 'dark')
  }

  const value = useMemo(
    () => ({
      preference,
      theme: resolvedTheme,
      isDark: resolvedTheme === 'dark',
      setPreference,
      toggleTheme,
    }),
    [preference, resolvedTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
