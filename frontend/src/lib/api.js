// The API base URL must be provided via VITE_API_URL at build time. We do NOT
// hardcode a production backend URL as a fallback: a stale hostname baked into
// the bundle silently points every request at the wrong (or a decommissioned)
// server. In dev, default to the local backend; in a real build a missing
// VITE_API_URL is a configuration error we surface loudly.
const resolveApiBase = () => {
  const configured = import.meta.env.VITE_API_URL
  if (configured) return configured
  if (import.meta.env.DEV) return 'http://localhost:5050/api'
  throw new Error('VITE_API_URL is not set. Configure it in your deployment environment.')
}

const API_BASE = resolveApiBase()
const STORAGE_KEY = 'unifi_auth_v1'

const parseBody = async (res) => {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, message: text }
  }
}

// A single in-flight refresh is shared by every request that hits a 401 while
// it runs. This prevents a burst of concurrent 401s from each firing their own
// /auth/refresh — which, with refresh-token rotation, would revoke each other's
// tokens and spuriously log the user out.
let refreshPromise = null

const runTokenRefresh = () => {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    let stored = {}
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch {
      stored = {}
    }
    const rt = stored.refreshToken
    if (!rt) return null

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      const refreshRes = await parseBody(res)

      if (refreshRes && refreshRes.success && refreshRes.data?.accessToken) {
        const updatedSession = {
          accessToken: refreshRes.data.accessToken,
          refreshToken: refreshRes.data.refreshToken || rt,
          user: refreshRes.data.user || stored.user,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession))
        window.dispatchEvent(new CustomEvent('unifi_auth_update', { detail: updatedSession }))
        return updatedSession.accessToken
      }

      localStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('unifi_auth_clear'))
      return null
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('unifi_auth_clear'))
      return null
    } finally {
      // Release the shared slot only after all current awaiters have resolved.
      refreshPromise = null
    }
  })()

  return refreshPromise
}

const request = async ({ path, method = 'GET', token, body, isMultipart = false, isRetry = false }) => {
  const headers = {}
  if (!isMultipart) headers['Content-Type'] = 'application/json'

  let activeToken = token
  if (!activeToken) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      activeToken = stored.accessToken
    } catch {}
  }

  if (activeToken) headers.Authorization = `Bearer ${activeToken}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isMultipart ? body : JSON.stringify(body)) : undefined,
    credentials: 'include',
  })

  const payload = await parseBody(res)

  // ── Automatic 401 token refresh & retry interceptor ────────────────────────
  if (res.status === 401 && !isRetry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const retryToken = await runTokenRefresh()
    if (retryToken) {
      return request({ path, method, token: retryToken, body, isMultipart, isRetry: true })
    }
  }

  if (!res.ok) {
    const error = new Error(payload?.message || 'Request failed')
    error.payload = payload
    error.status = res.status
    throw error
  }

  return payload
}

export const api = {
  get: (path, token) => request({ path, token }),
  post: (path, body, token, isMultipart = false) => request({ path, method: 'POST', body, token, isMultipart }),
  patch: (path, body, token) => request({ path, method: 'PATCH', body, token }),
}
