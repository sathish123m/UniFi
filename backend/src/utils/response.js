const ok = (res, data={}, message='Success', code=200) => res.status(code).json({ success:true, message, data })
module.exports = { ok }
