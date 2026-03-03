const crypto = require('crypto')
const ALG = 'aes-256-cbc'
const KEY = () => Buffer.from(process.env.ENCRYPTION_KEY || '0'.repeat(64), 'hex')
const encrypt = (text) => {
  const iv = crypto.randomBytes(16)
  const c  = crypto.createCipheriv(ALG, KEY(), iv)
  return iv.toString('hex') + ':' + Buffer.concat([c.update(text,'utf8'), c.final()]).toString('hex')
}
const decrypt = (enc) => {
  const [ivH, dataH] = enc.split(':')
  const d = crypto.createDecipheriv(ALG, KEY(), Buffer.from(ivH,'hex'))
  return Buffer.concat([d.update(Buffer.from(dataH,'hex')), d.final()]).toString('utf8')
}
module.exports = { encrypt, decrypt }
