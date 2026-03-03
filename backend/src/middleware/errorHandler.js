const logger = require('../config/logger')
const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} | ${req.method} ${req.originalUrl}`)
  if (err.code==='P2002') return res.status(409).json({success:false,message:`${err.meta?.target?.join(', ')} already exists`})
  if (err.code==='P2025') return res.status(404).json({success:false,message:'Record not found'})
  if (err.name==='ZodError') return res.status(422).json({success:false,message:'Validation failed',errors:err.errors})
  const s = err.statusCode||err.status||500
  res.status(s).json({success:false,message:err.message||'Server error',
    ...(process.env.NODE_ENV==='development'&&{stack:err.stack})})
}
module.exports = { errorHandler }
