const { createLogger, format, transports } = require('winston')
const path = require('path')
const fs = require('fs')
const logDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir)
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.colorize(),
    format.printf(({ timestamp, level, message, stack }) =>
      stack ? `${timestamp} [${level}]: ${message}\n${stack}` : `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logDir,'error.log'), level: 'error' }),
    new transports.File({ filename: path.join(logDir,'combined.log') }),
  ],
})
module.exports = logger
