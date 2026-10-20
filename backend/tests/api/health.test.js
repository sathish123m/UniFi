const request = require('supertest')
const app = require('../../src/app')

describe('service metadata and routing', () => {
  it('reports healthy in record-only mode', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.mode).toBe('record-only')
    expect(Date.parse(res.body.time)).not.toBeNaN()
  })

  it('serves the root descriptor', async () => {
    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      success: true,
      health: '/health',
      apiBase: '/api',
    })
  })

  it('advertises the API route groups', async () => {
    const res = await request(app).get('/api')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.routes).toEqual(
      expect.arrayContaining(['/api/auth', '/api/users', '/api/loans', '/api/admin']),
    )
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/definitely-not-a-route')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, message: 'Route not found' })
  })

  it('sets hardening headers and hides the framework banner', async () => {
    const res = await request(app).get('/health')

    expect(res.headers['x-powered-by']).toBeUndefined()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
  })

  it('does not reflect an untrusted cross-origin request', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com')

    // The handler still answers, but the browser must not receive an
    // Access-Control-Allow-Origin for a non-allowlisted origin.
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
