const API_BASE = import.meta.env.VITE_API_URL || 'https://unifi-backend-u99t.onrender.com/api'
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

let isRefreshing = false
let refreshSubscribers = []

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb)
}

const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken))
  refreshSubscribers = []
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
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const rt = stored.refreshToken

      if (rt) {
        if (!isRefreshing) {
          isRefreshing = true
          fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          })
            .then(parseBody)
            .then((refreshRes) => {
              isRefreshing = false
              if (refreshRes && refreshRes.success && refreshRes.data?.accessToken) {
                const updatedSession = {
                  accessToken: refreshRes.data.accessToken,
                  refreshToken: refreshRes.data.refreshToken || rt,
                  user: refreshRes.data.user || stored.user,
                }
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSession))
                window.dispatchEvent(new CustomEvent('unifi_auth_update', { detail: updatedSession }))
                onRefreshed(refreshRes.data.accessToken)
              } else {
                localStorage.removeItem(STORAGE_KEY)
                window.dispatchEvent(new CustomEvent('unifi_auth_clear'))
                onRefreshed(null)
              }
            })
            .catch(() => {
              isRefreshing = false
              localStorage.removeItem(STORAGE_KEY)
              window.dispatchEvent(new CustomEvent('unifi_auth_clear'))
              onRefreshed(null)
            })
        }

        const retryToken = await new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => resolve(newToken))
        })

        if (retryToken) {
          return request({ path, method, token: retryToken, body, isMultipart, isRetry: true })
        }
      }
    } catch {
      // ignore parse errors and proceed to throw
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
