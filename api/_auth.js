const crypto = require('crypto');
const secret = () => (process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '') + '|excess';
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (p) => crypto.createHmac('sha256', secret()).update(p).digest('base64url');

exports.crear = (dias = 30) => { const p = b64(JSON.stringify({ exp: Date.now() + dias * 864e5 })); return p + '.' + sign(p); };
exports.valido = (tok) => {
  if (!process.env.ADMIN_PASSWORD || !tok) return false;
  const [p, s] = String(tok).split('.');
  if (!p || !s) return false;
  const esperado = Buffer.from(sign(p)), dado = Buffer.from(s);
  if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
};
exports.deRequest = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
exports.passwordOk = (pw) => {
  const real = process.env.ADMIN_PASSWORD || '';
  const a = Buffer.from(String(pw || '')), b = Buffer.from(real);
  return real.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};
