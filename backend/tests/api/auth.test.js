const request = require('supertest')
const app = require('../../src/app')

/**
 * Contract tests for the unauthenticated surface: validation, credential
 * handling and bearer-token enforcement. No rows are written here.
 */
describe('auth surface', () => {
  it('rejects a malformed login payload with 422 and field errors', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' })

    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['email', 'password']))
  })

  it('returns 401 for an unknown account', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `missing-${Date.now()}@lpu.in`, password: 'CorrectHorse123!' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 401 for a garbage refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-jwt' })

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it.each(['/api/auth/me', '/api/users/profile', '/api/loans/my'])(
    'requires a bearer token on %s',
    async (path) => {
      const res = await request(app).get(path)

      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ success: false, message: 'No token' })
    },
  )

  it('rejects a forged bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.forged.signature')

    expect(res.status).toBe(401)
  })

  it('serves the public university list', async () => {
    const res = await request(app).get('/api/auth/universities')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ emailDomain: expect.any(String) }),
    )
  })
})
