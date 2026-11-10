// Publica paquetes, galería y datos del sitio: hace UN commit en GitHub (data/site.json + fotos nuevas).
// Vercel detecta el commit y redespliega solo (~30-60 s).
const { valido, deRequest } = require('./_auth');

const API = 'https://api.github.com';
const gh = async (path, opts = {}) => {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'excess-panel' } });
  if (r.status === 404 && opts.allow404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!valido(deRequest(req))) return res.status(401).json({ error: 'Sesión vencida. Vuelve a entrar.' });
  const repo = process.env.GITHUB_REPO, branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo || !process.env.GITHUB_TOKEN) return res.status(500).json({ error: 'Faltan GITHUB_TOKEN o GITHUB_REPO en Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const paquetes = (Array.isArray(body.paquetes) ? body.paquetes : []).slice(0, 30).map((p) => ({
      nombre: String(p.nombre || '').slice(0, 60), precio: Number(p.precio) || 0, destacado: ['popular', 'vip'].includes(p.destacado) ? p.destacado : '',
      items: (p.items || []).map((i) => String(i).slice(0, 120)).slice(0, 40), wa: String(p.wa || '').slice(0, 300), activo: p.activo !== false,
    }));
    const sitio = {};
    if (body.sitio?.whatsapp) sitio.whatsapp = String(body.sitio.whatsapp).replace(/\D/g, '').slice(0, 15);
    if (body.sitio?.descPaquetes !== undefined) sitio.descPaquetes = String(body.sitio.descPaquetes).slice(0, 200);
    if (body.sitio?.notaGaleria !== undefined) sitio.notaGaleria = String(body.sitio.notaGaleria).slice(0, 200);

    // estado actual en el repo (para saber qué fotos ya no se usan)
    const actual = await gh(`/repos/${repo}/contents/data/site.json?ref=${branch}`, { allow404: true });
    const previo = actual ? JSON.parse(Buffer.from(actual.content, 'base64').toString()) : { galeria: [] };
    const files = [];
    const galeria = [];
    for (const f of (Array.isArray(body.galeria) ? body.galeria : []).slice(0, 60)) {
      let src = String(f.src || '');
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(src);
      if (m) {
        const nombre = `imagenes/gal/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        files.push({ path: nombre, content: m[1] });
        src = nombre;
      } else if (!/^imagenes\/[\w./-]+$/.test(src)) continue;
      galeria.push({ src, alt: String(f.alt || '').slice(0, 120), forma: ['wide', 'tall'].includes(f.forma) ? f.forma : '', activo: f.activo !== false });
    }
    const usadas = new Set(galeria.map((g) => g.src));
    const borrar = (previo.galeria || []).map((g) => g.src).filter((s) => s.startsWith('imagenes/gal/') && !usadas.has(s));

    const site = { actualizado: new Date().toISOString(), sitio, paquetes, galeria };
    files.push({ path: 'data/site.json', content: Buffer.from(JSON.stringify(site, null, 1)).toString('base64') });

    const ref = await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    const commit = await gh(`/repos/${repo}/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of files) {
      const blob = await gh(`/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'base64' }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    borrar.forEach((p) => tree.push({ path: p, mode: '100644', type: 'blob', sha: null }));
    const nt = await gh(`/repos/${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree }) });
    const nc = await gh(`/repos/${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: 'Panel: actualiza paquetes y galería', tree: nt.sha, parents: [ref.object.sha] }) });
    await gh(`/repos/${repo}/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) });
    res.status(200).json({ ok: true, galeria });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
