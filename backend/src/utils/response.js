const ok   = (res, data={}, message='Success', code=200) => res.status(code).json({ success:true,  message, data })
const fail = (res, message='Error', code=400)             => res.status(code).json({ success:false, message })
module.exports = { ok, fail }
