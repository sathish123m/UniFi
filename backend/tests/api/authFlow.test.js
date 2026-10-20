const request = require('supertest')
const bcrypt = require('bcrypt')
const app = require('../../src/app')
const prisma = require('../../src/config/db')

/**
 * End-to-end auth lifecycle against the real database:
 *   login -> access token works -> refresh rotates -> replay rejected -> logout.
 *
 * The fixture user is namespaced and removed in afterAll, so this is safe to run
 * against a shared development database.
 */
describe('auth lifecycle (database-backed)', () => {
  const email = `jest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lpu.in`
  const password = 'JestPassw0rd!'

  let userId

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        firstName: 'Jest',
        lastName: 'Fixture',
        role: 'BORROWER',
        emailVerified: true,
      },
    })
    userId = user.id
  })

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } })
    }
    await prisma.$disconnect()
  })

  it('logs in, authenticates with the access token and rotates the refresh token', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password })

    expect(login.status).toBe(200)
    expect(login.body.data.user).toMatchObject({ email, role: 'BORROWER' })
    expect(typeof login.body.data.accessToken).toBe('string')
    expect(typeof login.body.data.refreshToken).toBe('string')

    const { accessToken, refreshToken } = login.body.data

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(me.status).toBe(200)
    expect(me.body.data).toMatchObject({ id: userId, email })

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken })

    expect(rotated.status).toBe(200)
    expect(rotated.body.data.refreshToken).not.toBe(refreshToken)

    // Single-use rotation: the consumed token cannot be replayed.
    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken })
    expect(replay.status).toBe(401)

    // Logout revokes the newest token.
    const next = rotated.body.data.refreshToken
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${rotated.body.data.accessToken}`)
      .send({ refreshToken: next })

    expect(logout.status).toBe(200)

    const afterLogout = await request(app).post('/api/auth/refresh').send({ refreshToken: next })
    expect(afterLogout.status).toBe(401)
  })

  it('refuses login before the email is verified', async () => {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: false } })

    const res = await request(app).post('/api/auth/login').send({ email, password })

    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/verify your email/i)

    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } })
  })

  it('refuses login for a suspended account', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isSuspended: true } })

    const res = await request(app).post('/api/auth/login').send({ email, password })

    expect(res.status).toBe(403)

    await prisma.user.update({ where: { id: userId }, data: { isSuspended: false } })
  })
})
