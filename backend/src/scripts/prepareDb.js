const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const run = (cmd) => {
  console.log(`[db-prepare] ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

const hasMigrationDirs = () => {
  const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations')
  if (!fs.existsSync(migrationsPath)) return false
  return fs.readdirSync(migrationsPath, { withFileTypes: true }).some((entry) => entry.isDirectory())
}

const shouldSeed = () => String(process.env.DB_SEED_ON_DEPLOY || 'true').toLowerCase() === 'true'

const main = () => {
  if (hasMigrationDirs()) {
    run('npx prisma migrate deploy')
  } else {
    console.log('[db-prepare] No migrations found -> running prisma db push')
    run('npx prisma db push')
  }

  if (shouldSeed()) {
    run('node prisma/seed.js')
  } else {
    console.log('[db-prepare] Skipping seed (DB_SEED_ON_DEPLOY=false)')
  }
}

try {
  main()
} catch (error) {
  console.error('[db-prepare] Failed:', error.message)
  process.exit(1)
}
