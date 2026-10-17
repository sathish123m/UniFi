const logger = require('../config/logger')
const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} | ${req.method} ${req.originalUrl}`)
  if (err.code==='P2002') return res.status(409).json({success:false,message:`${err.meta?.target?.join(', ')} already exists`})
  if (err.code==='P2025') return res.status(404).json({success:false,message:'Record not found'})
  if (err.name==='ZodError') return res.status(422).json({success:false,message:'Validation failed',errors:err.errors})
  const s = err.statusCode||err.status||500
  // Never leak internal error details (DB driver text, stack) to clients on 5xx.
  // Those are logged above; the client only gets a generic message. Intentional
  // 4xx errors carry safe, user-facing messages so we pass those through.
  const isDev = process.env.NODE_ENV==='development'
  const message = s >= 500 ? 'Server error' : (err.message || 'Request failed')
  res.status(s).json({success:false,message,
    ...(isDev && s >= 500 && {detail: err.message, stack: err.stack})})
}
module.exports = { errorHandler }
