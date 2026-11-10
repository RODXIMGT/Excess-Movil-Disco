// Almacén local (IndexedDB) con la misma forma básica que usaba Firestore.
// Todo queda en ESTE navegador. Lo público se manda al sitio con "Publicar" (api/publish).
const PUBLICO = (p) => p.startsWith('paquetes/') || p.startsWith('galeria/') || p === 'config/sitio';
let data = {};            // path -> objeto
const subs = [];
let timer;

const idb = () => new Promise((ok, no) => {
  const r = indexedDB.open('excess-panel', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const idbGet = async () => { const d = await idb(); return new Promise((ok) => { const q = d.transaction('kv').objectStore('kv').get('data'); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); };
const idbSet = async (v) => { const d = await idb(); return new Promise((ok) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'data'); t.oncomplete = ok; t.onerror = ok; }); };

export async function ready() { try { data = (await idbGet()) || {}; } catch { data = {}; } return Object.keys(data).length > 0; }
const persist = () => { clearTimeout(timer); timer = setTimeout(() => idbSet(data), 250); };
const notify = () => subs.forEach((f) => f());
const clone = (x) => JSON.parse(JSON.stringify(x));
const put = (path, d) => { data[path] = clone(d); if (PUBLICO(path)) data['meta/estado'] = { pendiente: true }; };

export const collection = (_, name) => ({ col: name });
export const doc = (a, c, i) => (a && a.col ? { path: a.col + '/' + Math.random().toString(36).slice(2, 10) } : { path: c + '/' + i });
export const setDoc = async (r, d) => { put(r.path, d); persist(); notify(); };
export const deleteDoc = async (r) => { delete data[r.path]; if (PUBLICO(r.path)) data['meta/estado'] = { pendiente: true }; persist(); notify(); };
export const writeBatch = () => {
  const ops = [];
  return {
    set: (r, d) => ops.push(() => put(r.path, d)),
    update: (r, d) => ops.push(() => put(r.path, { ...data[r.path], ...d })),
    delete: (r) => ops.push(() => { delete data[r.path]; if (PUBLICO(r.path)) data['meta/estado'] = { pendiente: true }; }),
    commit: async () => { ops.forEach((f) => f()); persist(); notify(); },
  };
};
const snapD = (p) => ({ id: p.split('/')[1], exists: () => p in data, data: () => clone(data[p]) });
export const onSnapshot = (t, next) => {
  const f = () => (t.col ? next({ docs: Object.keys(data).filter((k) => k.startsWith(t.col + '/')).map(snapD) }) : next(snapD(t.path)));
  subs.push(f); setTimeout(f, 0); return () => subs.splice(subs.indexOf(f), 1);
};
// utilidades de respaldo
export const exportAll = () => clone(data);
export const importAll = async (obj) => { data = clone(obj); persist(); notify(); };
export const resetPublic = async () => { Object.keys(data).forEach((k) => PUBLICO(k) && delete data[k]); data['meta/estado'] = { pendiente: false }; persist(); notify(); };
export const marcarPublicado = async () => { data['meta/estado'] = { pendiente: false }; persist(); notify(); };
export const pendiente = () => !!data['meta/estado']?.pendiente;
export const flush = () => idbSet(data);
