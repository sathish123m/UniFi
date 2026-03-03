const { verifyAccessToken } = require('../utils/jwt')
const prisma = require('../config/db')
const protect = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ success:false, message:'No token' })
  try {
    const decoded = verifyAccessToken(h.split(' ')[1])
    const user = await prisma.user.findUnique({ where:{id:decoded.userId}, select:{
      id:true,email:true,role:true,firstName:true,lastName:true,
      kycStatus:true,isActive:true,isSuspended:true,isBanned:true,
      creditScore:true,borrowLimit:true,upiVerified:true,universityId:true
    }})
    if (!user)            return res.status(401).json({ success:false, message:'User not found' })
    if (user.isBanned)    return res.status(403).json({ success:false, message:'Account banned' })
    if (user.isSuspended) return res.status(403).json({ success:false, message:'Account suspended' })
    if (!user.isActive)   return res.status(403).json({ success:false, message:'Account inactive' })
    req.user = user; next()
  } catch { res.status(401).json({ success:false, message:'Invalid or expired token' }) }
}
const restrictTo  = (...roles)  => (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({success:false,message:'Access denied'})
const requireKyc  = (req,res,next) => req.user.kycStatus==='APPROVED' ? next() : res.status(403).json({success:false,message:'KYC not approved'})
const requireUpi  = (req,res,next) => req.user.upiVerified ? next() : res.status(403).json({success:false,message:'Link your UPI ID first'})
module.exports = { protect, restrictTo, requireKyc, requireUpi }
