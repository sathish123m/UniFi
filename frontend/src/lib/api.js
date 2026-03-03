const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5050/api'

const parseBody = async (res) => {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, message: text }
  }
}

const request = async ({ path, method = 'GET', token, body, isMultipart = false }) => {
  const headers = {}
  if (!isMultipart) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (isMultipart ? body : JSON.stringify(body)) : undefined,
    credentials: 'include',
  })

  const payload = await parseBody(res)
  if (!res.ok) {
    const error = new Error(payload?.message || 'Request failed')
    error.payload = payload
    throw error
  }

  return payload
}

export const api = {
  get: (path, token) => request({ path, token }),
  post: (path, body, token, isMultipart = false) => request({ path, method: 'POST', body, token, isMultipart }),
  patch: (path, body, token) => request({ path, method: 'PATCH', body, token }),
}
