const { verifyAccessToken } = require('../utils/jwt')
const prisma = require('../config/db')

const USER_SELECT = {
  id:true,email:true,role:true,firstName:true,lastName:true,
  kycStatus:true,isActive:true,isSuspended:true,isBanned:true,
  creditScore:true,borrowLimit:true,upiVerified:true,universityId:true
}

const authenticate = async (req, res, { allowSuspended = false } = {}) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ success:false, message:'No token' }); return false }
  try {
    const decoded = verifyAccessToken(h.split(' ')[1])
    const user = await prisma.user.findUnique({ where:{id:decoded.userId}, select: USER_SELECT })
    if (!user)            { res.status(401).json({ success:false, message:'User not found' }); return false }
    if (user.isBanned)    { res.status(403).json({ success:false, message:'Account banned' }); return false }
    // A suspended account is frozen for all new activity. The one exception is the
    // repayment flow (allowSuspended), so a suspended borrower can still clear an
    // outstanding loan — otherwise suspension and the outstanding debt would be an
    // inescapable deadlock.
    if (user.isSuspended && !allowSuspended) { res.status(403).json({ success:false, message:'Account suspended' }); return false }
    if (!user.isActive)   { res.status(403).json({ success:false, message:'Account inactive' }); return false }
    req.user = user
    return true
  } catch { res.status(401).json({ success:false, message:'Invalid or expired token' }); return false }
}

const protect = async (req, res, next) => {
  if (await authenticate(req, res)) next()
}
const protectAllowSuspended = async (req, res, next) => {
  if (await authenticate(req, res, { allowSuspended: true })) next()
}
const restrictTo  = (...roles)  => (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({success:false,message:'Access denied'})
const requireKyc  = (req,res,next) => req.user.kycStatus==='APPROVED' ? next() : res.status(403).json({success:false,message:'KYC not approved'})
const requireUpi  = (req,res,next) => req.user.upiVerified ? next() : res.status(403).json({success:false,message:'Link your UPI ID first'})
module.exports = { protect, protectAllowSuspended, restrictTo, requireKyc, requireUpi }
