#!/usr/bin/env node
/**
 * Rotate UniFi's Render environment variables from ~/UniFi-rotated-secrets.txt.
 *
 * Needs a Render API key (Account Settings -> API Keys -> Create API Key).
 * Provide it either as an env var or in a file:
 *
 *   RENDER_API_KEY=rnd_xxx node scripts/render-rotate-env.mjs
 *   # or:  echo 'rnd_xxx' > ~/.render-api-key && chmod 600 ~/.render-api-key
 *   #      node scripts/render-rotate-env.mjs
 *
 * Flags:
 *   --include-encryption-key   also rotate ENCRYPTION_KEY (see warning below)
 *   --no-deploy                update vars but do not trigger a redeploy
 *
 * WARNING: ENCRYPTION_KEY is the AES-256 key for stored UPI IDs. Rotating it
 * makes every UPI ID already in the database unreadable. Only use the flag if
 * the database holds no real user data (or you accept users re-entering UPI).
 *
 * Values are never printed.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const API = 'https://api.render.com/v1'
const SECRETS_FILE = path.join(os.homedir(), 'UniFi-rotated-secrets.txt')
const KEY_FILE = path.join(os.homedir(), '.render-api-key')

const flags = new Set(process.argv.slice(2))
const includeEncryptionKey = flags.has('--include-encryption-key')
const shouldDeploy = !flags.has('--no-deploy')

const apiKey =
  (process.env.RENDER_API_KEY || '').trim() ||
  (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '')

if (!apiKey) {
  console.error('No Render API key.')
  console.error('  Set RENDER_API_KEY, or write the key to ~/.render-api-key')
  process.exit(1)
}
if (!fs.existsSync(SECRETS_FILE)) {
  console.error(`Missing ${SECRETS_FILE} (run the generator first)`)
  process.exit(1)
}

const secrets = Object.fromEntries(
  fs
    .readFileSync(SECRETS_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
}

async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> ${res.status} ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : null
}

async function listServices() {
  const raw = await api('GET', '/services?limit=100')
  const items = Array.isArray(raw) ? raw : []
  return items.map((item) => item.service || item).filter((s) => s && s.id)
}

async function setVar(serviceId, key, value) {
  await api('PUT', `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`, { value })
}

async function deploy(serviceId) {
  return api('POST', `/services/${serviceId}/deploys`, { clearCache: 'do_not_clear' })
}

const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
const encryptionVars = ['ENCRYPTION_KEY']

function varsFor(kind) {
  const keys = [...required]
  if (kind === 'web' && includeEncryptionKey) keys.push(...encryptionVars)
  if (kind === 'cron' && includeEncryptionKey) keys.push(...encryptionVars)
  return keys
}

async function main() {
  const services = await listServices()
  const web = services.find((s) => s.name === 'unifi-backend')
  const cron = services.find((s) => s.name === 'unifi-jobs')

  if (!web) throw new Error('Service "unifi-backend" not found on this Render account')
  if (!cron) console.warn('! Service "unifi-jobs" not found — cron vars skipped')

  const plan = [
    { label: 'web  unifi-backend', service: web, kind: 'web' },
    ...(cron ? [{ label: 'cron unifi-jobs', service: cron, kind: 'cron' }] : []),
  ]

  for (const { label, service, kind } of plan) {
    for (const key of varsFor(kind)) {
      if (!secrets[key]) {
        console.warn(`  - ${label}: ${key} missing from secrets file, skipped`)
        continue
      }
      await setVar(service.id, key, secrets[key])
      console.log(`  + ${label}: ${key} updated`)
    }
  }

  if (includeEncryptionKey) {
    console.log('  + ENCRYPTION_KEY rotated on both services (must be identical)')
  } else {
    console.log('  = ENCRYPTION_KEY left unchanged (pass --include-encryption-key to rotate)')
  }

  if (shouldDeploy) {
    for (const { label, service } of plan) {
      await deploy(service.id)
      console.log(`  ~ ${label}: redeploy triggered`)
    }
  } else {
    console.log('  = redeploy skipped (--no-deploy)')
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('\nFAILED:', err.message)
  process.exit(1)
})
