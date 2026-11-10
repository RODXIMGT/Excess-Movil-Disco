const { crear, valido, deRequest, passwordOk } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Falta la variable ADMIN_PASSWORD en Vercel.' });
  if (req.method === 'GET') return res.status(valido(deRequest(req)) ? 200 : 401).json({ ok: valido(deRequest(req)) });
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!passwordOk(body.password)) { await new Promise((r) => setTimeout(r, 1200)); return res.status(401).json({ error: 'Contraseña incorrecta' }); }
  res.status(200).json({ token: crear(30) });
};
