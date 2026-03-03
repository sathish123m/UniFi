const { PrismaClient } = require('@prisma/client')
const logger = require('./logger')
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error','warn'] : ['error'],
})
module.exports = prisma
