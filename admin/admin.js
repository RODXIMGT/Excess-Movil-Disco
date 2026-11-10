import { ready, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, exportAll, importAll, resetPublic, marcarPublicado, pendiente, flush } from './store.js';

const db = {};
const imgSrc = (u) => (String(u).startsWith('data:') || /^https?:/.test(u) ? u : '../' + u);
const TOKEN_KEY = 'excess_token';
const getTok = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
let logged = false;

// ───────── utilidades ─────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Q = (n) => 'Q ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fechaLarga = (f) => { if (!f) return '—'; const [y, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1].toLowerCase()} de ${y}`; };
const toast = (t) => { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), 2600); };
const uid = () => Math.random().toString(36).slice(2, 10);

const DEF_INTERNO = {
  emisores: [
    { id: 'em-rodrigo', nombre: 'Rodrigo Ramos', cargo: '', tel: '4056-4500', email: 'excessdiscomovil@gmail.com' },
    { id: 'em-alexia', nombre: 'Alexia Peinado', cargo: 'Gerente de Ventas', tel: '3355-1106', email: '' },
  ],
  articulos: [
    { id: 'a1', desc: 'Hora extra de servicio', precio: 150 },
    { id: 'a2', desc: 'Bocina JBL adicional', precio: 125 },
    { id: 'a3', desc: 'Lámpara audio-color adicional', precio: 60 },
    { id: 'a4', desc: 'Micrófono inalámbrico', precio: 75 },
    { id: 'a5', desc: 'Transporte fuera de la ciudad', precio: 250 },
  ],
  anticipoPct: 50, vigenciaDias: 15,
  terminos: '• Para reservar la fecha se requiere el anticipo indicado. Sin anticipo la fecha no queda apartada.\n• El saldo se cancela el día del evento, antes de iniciar el servicio.\n• Esta cotización es válida por el tiempo indicado y está sujeta a disponibilidad de fecha.\n• Las horas adicionales se cobran por aparte y se acuerdan con anticipación.\n• Los cambios de fecha o de lugar deben avisarse con al menos 8 días de anticipación.',
};
const PAQ_ACTUALES = [
  { nombre: 'Básico', precio: 1500, destacado: '', items: ['2 Bocinas JBL', '1 Subwoofer 18"', '4 Luces LED', 'Stand de luces', '5 horas de servicio', 'Música al gusto'] },
  { nombre: 'Estándar', precio: 2300, destacado: 'popular', items: ['4 Bocinas JBL', '4 Lámparas audio-color', '2 Mini cabezas móviles', 'Stand de luces', 'TV 50"', '5 horas de servicio', 'Música al gusto'] },
  { nombre: 'Premium', precio: 3000, destacado: '', items: ['6 Bocinas JBL', '4 Lámparas audio-color', '2 Cristal Ball LED', '2 Mini cabezas móviles', 'Stand de luces', 'TV 50"', '5 horas de servicio', 'Música al gusto'] },
  { nombre: 'VIP', precio: 3500, destacado: 'vip', items: ['6 Bocinas JBL', '4 Bocinas Sub piso 15"', '8 Lámparas audio-color', '2 Cristal Ball LED', '4 Mini cabezas móviles', 'Trusas para luces', 'TV 50"', '5 horas de servicio', 'Música al gusto'] },
];

// ───────── estado ─────────
const S = { paquetes: [], galeria: [], cot: [], pagos: [], sitio: {}, interno: DEF_INTERNO, tab: 'resumen', calMes: hoy().slice(0, 7), dirty: false, filtro: 'todas' };
const byOrden = (a, b) => (a.orden ?? 0) - (b.orden ?? 0);
let unsubs = [];

function listen() {
  const sub = (name, key, map) => onSnapshot(collection(db, name), (s) => { S[key] = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (map) S[key].sort(map); rerender(); }, (e) => toast('Error leyendo ' + name + ': ' + e.code));
  unsubs = [
    sub('paquetes', 'paquetes', byOrden),
    sub('galeria', 'galeria', byOrden),
    sub('cotizaciones', 'cot', (a, b) => b.numero.localeCompare(a.numero)),
    onSnapshot(collection(db, 'pagos'), (s) => { S.pagos = s.docs.map((d) => ({ id: d.id, ...d.data() })); if (CQ && !$('#modal').hidden) pintaTotales(); rerender(); }),
    onSnapshot(doc(db, 'config', 'sitio'), (d) => { S.sitio = d.exists() ? d.data() : {}; rerender(); }),
    onSnapshot(doc(db, 'config', 'interno'), (d) => { S.interno = { ...DEF_INTERNO, ...(d.exists() ? d.data() : {}) }; rerender(); }),
  ];
}

// ───────── sesión (contraseña, validada en el servidor) ─────────
async function entrar() {
  const t = getTok();
  if (t) { try { const r = await fetch('/api/login', { headers: { Authorization: 'Bearer ' + t } }); if (r.ok) return iniciar(); } catch {} }
  $('#app').hidden = true; $('#login').hidden = false;
}
async function iniciar() {
  logged = true; $('#login').hidden = true; $('#app').hidden = false;
  const traer = !(await ready());
  if (traer) await importarPublicado();
  listen(); rerender(true);
}
async function importarPublicado() {
  try {
    const r = await fetch('../data/site.json', { cache: 'no-cache' }); if (!r.ok) return;
    const j = await r.json(); const bt = writeBatch(db);
    (j.paquetes || []).forEach((p, i) => bt.set(doc(collection(db, 'paquetes')), { ...p, orden: i }));
    (j.galeria || []).forEach((g, i) => bt.set(doc(collection(db, 'galeria')), { ...g, orden: i }));
    if (j.sitio && Object.keys(j.sitio).length) bt.set(doc(db, 'config', 'sitio'), j.sitio);
    await bt.commit(); await marcarPublicado();
  } catch {}
}
async function login() {
  $('#loginErr').textContent = '';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Error');
    localStorage.setItem(TOKEN_KEY, j.token); $('#pw').value = ''; iniciar();
  } catch (e) { $('#loginErr').textContent = e.message; }
}
$('#btnLogin').onclick = login;
$('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('#btnOut').onclick = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} location.reload(); };

async function publicar() {
  const b = $('#btnPub'); b.disabled = true; b.textContent = 'Publicando…';
  try {
    const body = { sitio: S.sitio, paquetes: S.paquetes, galeria: S.galeria };
    const tam = JSON.stringify(body).length;
    if (tam > 4200000) throw new Error('Demasiadas fotos nuevas de una vez. Publica en 2 tandas (ej. 10 fotos cada una).');
    const r = await fetch('/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getTok() }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Error al publicar');
    const bt = writeBatch(db);
    S.galeria.forEach((g) => bt.delete(doc(db, 'galeria', g.id)));
    j.galeria.forEach((g, i) => bt.set(doc(collection(db, 'galeria')), { ...g, orden: i }));
    await bt.commit(); await marcarPublicado();
    toast('Publicado ✔ — se verá en el sitio en ~1 minuto');
  } catch (e) { toast(e.message); }
  b.disabled = false; barraPub();
}
function barraPub() { const b = $('#btnPub'); if (!b) return; const p = pendiente(); b.textContent = p ? 'Publicar cambios ●' : 'Publicado ✔'; b.className = 'btn ' + (p ? 'btn-pink' : 'btn-ghost'); }
$('#btnPub').onclick = publicar;
window.addEventListener('beforeunload', () => flush());
entrar();
$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.tab = b.dataset.tab; S.dirty = false; location.hash = S.tab; rerender(true); };
S.tab = (location.hash.slice(1) || 'resumen');

// ───────── render ─────────
function rerender(force) {
  if (!logged) return;
  barraPub();
  if (S.dirty && !force) return;           // no pisar lo que se está editando
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const v = $('#view');
  ({ resumen: vResumen, cotizaciones: vCot, paquetes: vPaq, galeria: vGal, ajustes: vAjustes }[S.tab] || vResumen)(v);
}

// ───────── cálculos de cotización ─────────
function calc(q) {
  const sub = r2((q.items || []).reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.precio) || 0), 0));
  const total = Math.max(0, r2(sub - (Number(q.descuento) || 0)));
  const anticipo = r2(total * ((q.anticipoPct ?? S.interno.anticipoPct) / 100));
  const pagado = r2(S.pagos.filter((p) => p.quoteId === q.numero).reduce((a, p) => a + Number(p.monto || 0), 0));
  return { sub, total, anticipo, pagado, saldo: r2(total - pagado) };
}
const emisor = (id) => S.interno.emisores.find((e) => e.id === id) || S.interno.emisores[0] || { nombre: '', tel: '' };

// ───────── RESUMEN ─────────
function vResumen(v) {
  const conf = S.cot.filter((q) => q.estado === 'confirmada');
  const tot = conf.reduce((a, q) => a + calc(q).total, 0);
  const cob = S.pagos.filter((p) => conf.some((q) => q.numero === p.quoteId)).reduce((a, p) => a + Number(p.monto), 0);
  const porCobrar = conf.reduce((a, q) => a + Math.max(0, calc(q).saldo), 0);
  const proximos = conf.filter((q) => q.evento?.fecha >= hoy()).sort((a, b) => a.evento.fecha.localeCompare(b.evento.fecha)).slice(0, 6);
  const porMes = {};
  S.pagos.forEach((p) => { const m = (p.fecha || '').slice(0, 7); if (m) porMes[m] = (porMes[m] || 0) + Number(p.monto); });
  const meses = Object.keys(porMes).sort().reverse().slice(0, 12);

  v.innerHTML = `
  <div class="bar"><h2>Resumen</h2><button class="btn btn-primary" data-new>+ Nueva cotización</button></div>
  <div class="kpis">
    <div class="kpi"><small>Eventos confirmados</small><b>${conf.length}</b></div>
    <div class="kpi"><small>Valor confirmado</small><b>${Q(tot)}</b></div>
    <div class="kpi"><small>Cobrado</small><b>${Q(cob)}</b></div>
    <div class="kpi"><small>Por cobrar</small><b>${Q(porCobrar)}</b></div>
    <div class="kpi"><small>En espera de respuesta</small><b>${S.cot.filter((q) => q.estado === 'enviada').length}</b></div>
  </div>
  <div class="grid g2">
    <div class="card"><h3>Próximos eventos</h3>${proximos.length ? `<div class="tw"><table><tbody>${proximos.map((q) => `<tr class="click" data-open="${q.numero}"><td>${fechaLarga(q.evento.fecha)}</td><td>${esc(q.cliente?.nombre)}</td><td>${Q(calc(q).saldo)} pend.</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted mt">Sin eventos confirmados próximos.</p>'}</div>
    <div class="card"><h3>Ingresos por mes</h3>${meses.length ? `<div class="tw"><table><tbody>${meses.map((m) => `<tr><td>${MESES[+m.slice(5) - 1]} ${m.slice(0, 4)}</td><td style="text-align:right">${Q(porMes[m])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted mt">Aún no hay pagos registrados.</p>'}</div>
  </div>
  <div class="card mt">${calendario()}</div>`;
  v.onclick = (e) => {
    if (e.target.closest('[data-new]')) return editarCot();
    const o = e.target.closest('[data-open]'); if (o) return editarCot(o.dataset.open);
    const n = e.target.closest('[data-cal]'); if (n) { S.calMes = shiftMes(S.calMes, +n.dataset.cal); rerender(true); }
  };
}
const shiftMes = (ym, d) => { let [y, m] = ym.split('-').map(Number); m += d; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
function calendario() {
  const [y, m] = S.calMes.split('-').map(Number);
  const first = new Date(y, m - 1, 1), start = (first.getDay() + 6) % 7, dias = new Date(y, m, 0).getDate();
  const evs = S.cot.filter((q) => ['confirmada', 'enviada'].includes(q.estado) && q.evento?.fecha?.startsWith(S.calMes));
  let cells = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < start; i++) cells += '<div class="d out"></div>';
  for (let d = 1; d <= dias; d++) {
    const f = `${S.calMes}-${String(d).padStart(2, '0')}`;
    cells += `<div class="d ${f === hoy() ? 'hoy' : ''}">${d}${evs.filter((q) => q.evento.fecha === f).map((q) => `<button class="ev ${q.estado === 'confirmada' ? 'c' : 's'}" data-open="${q.numero}">${esc(q.evento.inicio || '')} ${esc(q.cliente?.nombre)}</button>`).join('')}</div>`;
  }
  return `<div class="bar"><h3>Calendario interno · ${MESES[m - 1]} ${y}</h3><div><button class="btn btn-sm" data-cal="-1">←</button> <button class="btn btn-sm" data-cal="1">→</button></div></div><div class="cal">${cells}</div><p class="muted mt" style="font-size:.85rem">Verde: confirmada · Amarillo: enviada (sin confirmar)</p>`;
}

// ───────── COTIZACIONES (lista) ─────────
function vCot(v) {
  const lista = S.cot.filter((q) => S.filtro === 'todas' || q.estado === S.filtro);
  v.innerHTML = `
  <div class="bar"><h2>Cotizaciones</h2><div style="display:flex;gap:.5rem;flex-wrap:wrap">
    <select id="fEstado" style="width:auto">${['todas', 'borrador', 'enviada', 'confirmada', 'rechazada', 'cancelada'].map((e) => `<option ${e === S.filtro ? 'selected' : ''}>${e}</option>`).join('')}</select>
    <button class="btn btn-primary" data-new>+ Nueva cotización</button></div></div>
  <div class="card tw"><table><thead><tr><th>No.</th><th>Cliente</th><th>Fecha evento</th><th>Estado</th><th>Total</th><th>Saldo</th></tr></thead><tbody>
  ${lista.map((q) => { const c = calc(q); return `<tr class="click" data-open="${q.numero}"><td>${q.numero}</td><td>${esc(q.cliente?.nombre)}</td><td>${q.evento?.fecha || '—'}</td><td><span class="pill e-${q.estado}">${q.estado}</span></td><td>${Q(c.total)}</td><td>${q.estado === 'confirmada' ? Q(c.saldo) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Sin cotizaciones.</td></tr>'}
  </tbody></table></div>`;
  $('#fEstado').onchange = (e) => { S.filtro = e.target.value; rerender(true); };
  v.onclick = (e) => { if (e.target.closest('[data-new]')) return editarCot(); const o = e.target.closest('[data-open]'); if (o) editarCot(o.dataset.open); };
}

// ───────── EDITOR DE COTIZACIÓN ─────────
let CQ = null; // cotización en edición
function nuevoNumero() {
  const max = S.cot.reduce((a, q) => Math.max(a, parseInt(String(q.numero).replace(/\D/g, ''), 10) || 0), 0);
  return 'EXC-' + String(max + 1).padStart(4, '0');
}
function editarCot(numero) {
  const ex = numero && S.cot.find((q) => q.numero === numero);
  CQ = ex ? JSON.parse(JSON.stringify(ex)) : {
    numero: nuevoNumero(), estado: 'borrador', cliente: { nombre: '', tel: '', email: '' },
    evento: { tipo: '', fecha: '', inicio: '', fin: '', lugar: '', personas: '' },
    paquete: '', incluye: [], items: [], descuento: 0, anticipoPct: S.interno.anticipoPct, vigenciaDias: S.interno.vigenciaDias,
    emisorId: S.interno.emisores[0]?.id, notaCliente: '', notaInterna: '', creada: hoy(),
  };
  CQ._nuevo = !ex;
  abrirModal(formCot());
  pintaItems(); pintaTotales();
}
function formCot() {
  const c = CQ;
  const f = (k, label, type = 'text', extra = '') => `<label>${label}<input type="${type}" data-k="${k}" value="${esc(k.split('.').reduce((o, p) => o?.[p], c) ?? '')}" ${extra}></label>`;
  return `
  <div class="bar"><h2>${c.numero} <span class="pill e-${c.estado}" id="pillEstado">${c.estado}</span></h2><button class="btn btn-ghost" data-close>✕</button></div>
  <div class="row">${f('cliente.nombre', 'Cliente')}${f('cliente.tel', 'Teléfono', 'tel')}${f('cliente.email', 'Correo', 'email')}</div>
  <div class="row mt">${f('evento.tipo', 'Tipo de evento')}${f('evento.fecha', 'Fecha', 'date')}${f('evento.inicio', 'Hora inicio', 'time')}${f('evento.fin', 'Hora fin', 'time')}${f('evento.personas', 'Personas', 'number')}</div>
  <div class="mt">${f('evento.lugar', 'Lugar del evento')}</div>
  <div class="card mt"><h3>Paquete base y artículos</h3>
    <div class="row mt"><label>Paquete base<select id="selPaq"><option value="">Elegir paquete…</option>${S.paquetes.map((p) => `<option value="${p.id}">${esc(p.nombre)} — ${Q(p.precio)}</option>`).join('')}</select></label>
    <label>Artículo adicional<select id="selArt"><option value="">Elegir artículo…</option>${S.interno.articulos.map((a) => `<option value="${a.id}">${esc(a.desc)} — ${Q(a.precio)}</option>`).join('')}</select></label>
    <label>&nbsp;<button class="btn" data-add-line>+ Línea libre</button></label></div>
    <label class="mt">Incluye (una línea por elemento; aparece en el PDF)<textarea id="incluye" data-k="__incluye">${esc((c.incluye || []).join('\n'))}</textarea></label>
    <div class="mt" id="lineas"></div></div>
  <div class="row mt">${f('descuento', 'Descuento (Q)', 'number', 'min="0" step="0.01"')}${f('anticipoPct', 'Anticipo %', 'number')}${f('vigenciaDias', 'Vigencia (días)', 'number')}
    <label>Emitida por<select data-k="emisorId">${S.interno.emisores.map((e) => `<option value="${e.id}" ${e.id === c.emisorId ? 'selected' : ''}>${esc(e.nombre)} · ${esc(e.tel)}</option>`).join('')}</select></label></div>
  <div class="row mt"><label>Nota para el cliente (sale en el PDF)<textarea data-k="notaCliente">${esc(c.notaCliente)}</textarea></label><label>Nota interna (no sale)<textarea data-k="notaInterna">${esc(c.notaInterna)}</textarea></label></div>
  <div class="totals mt" id="totales"></div>
  <div id="pagosBox" class="card mt"></div>
  <div id="avisos"></div>
  <div class="bar mt"><div style="display:flex;gap:.5rem;flex-wrap:wrap">
    <button class="btn btn-primary" data-save>Guardar</button>
    <button class="btn" data-estado="enviada">Marcar enviada</button>
    <button class="btn btn-pink" data-estado="confirmada">Confirmar</button>
    <button class="btn" data-estado="rechazada">Rechazada</button>
    <button class="btn" data-estado="cancelada">Cancelar</button>
    <button class="btn" data-pdf>Descargar PDF</button></div>
    ${CQ._nuevo ? '' : '<button class="btn btn-danger" data-del>Eliminar</button>'}</div>`;
}
function pintaItems() {
  $('#lineas').innerHTML = (CQ.items || []).map((i, n) => `<div class="li" data-n="${n}"><input data-i="desc" value="${esc(i.desc)}" placeholder="Descripción"><input data-i="qty" type="number" min="0" step="1" value="${i.qty}"><input data-i="precio" type="number" min="0" step="0.01" value="${i.precio}"><div style="text-align:right">${Q(i.qty * i.precio)}</div><button class="btn btn-sm btn-danger" data-rm="${n}">✕</button></div>`).join('') || '<p class="muted">Sin líneas. Elige un paquete base o agrega artículos.</p>';
}
function pintaTotales() {
  const c = calc(CQ);
  $('#totales').innerHTML = `<div><span>Subtotal</span><span>${Q(c.sub)}</span></div><div><span>Descuento</span><span>− ${Q(CQ.descuento)}</span></div><div class="big"><span>TOTAL</span><span>${Q(c.total)}</span></div><div><span>Anticipo (${CQ.anticipoPct}%)</span><span>${Q(c.anticipo)}</span></div><div><span>Pagado</span><span>${Q(c.pagado)}</span></div><div><span>Saldo</span><span>${Q(c.saldo)}</span></div>`;
  const ps = S.pagos.filter((p) => p.quoteId === CQ.numero).sort((a, b) => a.fecha.localeCompare(b.fecha));
  $('#pagosBox').innerHTML = CQ._nuevo ? '<p class="muted">Guarda la cotización para registrar pagos.</p>' : `<h3>Pagos</h3>
    ${ps.map((p) => `<div class="li" style="grid-template-columns:100px 1fr 100px 100px 34px"><span>${p.fecha}</span><span>${esc(p.tipo)} · ${esc(p.metodo)}</span><span></span><b>${Q(p.monto)}</b><button class="btn btn-sm btn-danger" data-rmpago="${p.id}">✕</button></div>`).join('') || '<p class="muted">Sin pagos.</p>'}
    <div class="row mt"><label>Monto<input id="pMonto" type="number" min="0" step="0.01" value="${c.pagado === 0 ? c.anticipo : Math.max(0, c.saldo)}"></label><label>Fecha<input id="pFecha" type="date" value="${hoy()}"></label>
    <label>Tipo<select id="pTipo"><option>Anticipo</option><option>Saldo</option><option>Otro</option></select></label>
    <label>Método<select id="pMetodo"><option>Efectivo</option><option>Transferencia</option><option>Depósito</option></select></label>
    <label>&nbsp;<button class="btn" data-addpago>Registrar pago</button></label></div>`;
}
function setPath(o, path, val) { const p = path.split('.'); const last = p.pop(); const t = p.reduce((a, k) => (a[k] ??= {}), o); t[last] = val; }
async function guardarCot(estado) {
  if (!CQ.cliente.nombre.trim()) return toast('Falta el nombre del cliente');
  if (estado) CQ.estado = estado;
  CQ.actualizada = hoy();
  const { _nuevo, ...data } = CQ;
  await setDoc(doc(db, 'cotizaciones', CQ.numero), data);
  const eraNueva = CQ._nuevo;
  CQ._nuevo = false;
  if (eraNueva) { abrirModal(formCot()); pintaItems(); }
  pintaTotales();
  toast('Cotización guardada');
}
function avisoChoque() {
  const otros = S.cot.filter((q) => q.estado === 'confirmada' && q.numero !== CQ.numero && q.evento?.fecha && q.evento.fecha === CQ.evento.fecha);
  return otros.length ? `<div class="warn">Ya hay ${otros.length} evento(s) confirmado(s) ese día: ${otros.map((q) => esc(q.numero + ' ' + q.cliente.nombre)).join(', ')}. ¿Confirmar de todos modos?<br><button class="btn btn-sm mt" data-forzar>Sí, confirmar</button></div>` : '';
}

// delegación del modal
$('#modalCard').addEventListener('input', (e) => {
  const t = e.target;
  if (!CQ) return;
  if (t.id === 'incluye') { CQ.incluye = t.value.split('\n').map((s) => s.trim()).filter(Boolean); return; }
  if (t.dataset.k) { let v = t.value; if (['descuento', 'anticipoPct', 'vigenciaDias'].includes(t.dataset.k)) v = Number(v) || 0; setPath(CQ, t.dataset.k, v); pintaTotales(); }
  else if (t.dataset.i) { const n = +t.closest('.li').dataset.n; CQ.items[n][t.dataset.i] = t.dataset.i === 'desc' ? t.value : Number(t.value) || 0; pintaTotales(); const li = t.closest('.li'); li.children[3].textContent = Q(CQ.items[n].qty * CQ.items[n].precio); }
});
$('#modalCard').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'selPaq' && t.value) {
    const p = S.paquetes.find((x) => x.id === t.value);
    CQ.paquete = p.nombre; CQ.incluye = [...(p.items || [])];
    CQ.items = CQ.items.filter((i) => !i._paq); CQ.items.unshift({ desc: `Paquete ${p.nombre}`, qty: 1, precio: p.precio, _paq: true });
    $('#incluye').value = CQ.incluye.join('\n'); pintaItems(); pintaTotales(); t.value = '';
  }
  if (t.id === 'selArt' && t.value) { const a = S.interno.articulos.find((x) => x.id === t.value); CQ.items.push({ desc: a.desc, qty: 1, precio: a.precio }); pintaItems(); pintaTotales(); t.value = ''; }
});
$('#modalCard').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b || !CQ) return;
  if (b.dataset.close !== undefined) return cerrarModal();
  if (b.dataset.addLine !== undefined) { CQ.items.push({ desc: '', qty: 1, precio: 0 }); pintaItems(); }
  if (b.dataset.rm !== undefined) { CQ.items.splice(+b.dataset.rm, 1); pintaItems(); pintaTotales(); }
  if (b.dataset.save !== undefined) await guardarCot();
  if (b.dataset.estado) {
    if (b.dataset.estado === 'confirmada') {
      if (!CQ.evento.fecha) return toast('Falta la fecha del evento');
      const av = avisoChoque(); if (av) { $('#avisos').innerHTML = av; return; }
    }
    await guardarCot(b.dataset.estado);
  }
  if (b.dataset.forzar !== undefined) { $('#avisos').innerHTML = ''; await guardarCot('confirmada'); }
  if (b.dataset.pdf !== undefined) exportPDF(CQ);
  if (b.dataset.del !== undefined) {
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Pulsa otra vez para eliminar'; return; }
    const batch = writeBatch(db); batch.delete(doc(db, 'cotizaciones', CQ.numero));
    S.pagos.filter((p) => p.quoteId === CQ.numero).forEach((p) => batch.delete(doc(db, 'pagos', p.id)));
    await batch.commit(); cerrarModal(); toast('Eliminada');
  }
  if (b.dataset.addpago !== undefined) {
    const monto = Number($('#pMonto').value); if (!(monto > 0)) return toast('Monto inválido');
    const id = uid();
    await setDoc(doc(db, 'pagos', id), { quoteId: CQ.numero, monto, fecha: $('#pFecha').value || hoy(), tipo: $('#pTipo').value, metodo: $('#pMetodo').value });
  }
  if (b.dataset.rmpago) { await deleteDoc(doc(db, 'pagos', b.dataset.rmpago)); }
});
function abrirModal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
function cerrarModal() { $('#modal').hidden = true; document.body.style.overflow = ''; CQ = null; S.dirty = false; rerender(true); }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') cerrarModal(); });

// ───────── PDF ─────────
function paperHTML(q) {
  const c = calc(q), em = emisor(q.emisorId), ev = q.evento || {};
  const vence = (() => { const d = new Date((q.creada || hoy()) + 'T12:00:00'); d.setDate(d.getDate() + (q.vigenciaDias || 15)); return d.toISOString().slice(0, 10); })();
  return `<style>
  .pp{width:794px;background:#fff;color:#14141c;font-family:'Rajdhani',Arial,sans-serif;font-size:14px}
  .pp .hd{background:#050508;color:#fff;padding:26px 34px;display:flex;justify-content:space-between;align-items:center;border-bottom:5px solid #ff0080}
  .pp .brand{font:400 38px 'Bebas Neue',Arial;letter-spacing:5px}.pp .brand b{color:#00e5ff;font-weight:400}
  .pp .no{text-align:right;font-size:13px;color:#c8cdd8}.pp .no strong{display:block;font:400 26px 'Bebas Neue',Arial;color:#fff;letter-spacing:2px}
  .pp .bd{padding:22px 34px}.pp h4{font:400 17px 'Bebas Neue',Arial;letter-spacing:2px;color:#ff0080;margin:14px 0 6px}
  .pp .two{display:flex;gap:30px}.pp .two>div{flex:1}.pp .l{color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  .pp table{width:100%;border-collapse:collapse;margin-top:6px}.pp th{background:#f1f2f6;text-align:left;padding:6px 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  .pp td{padding:6px 8px;border-bottom:1px solid #e4e6ee}.pp .r{text-align:right}
  .pp .inc{columns:2;margin:0;padding-left:18px;font-size:13px}
  .pp .tot{margin-left:auto;width:290px;margin-top:10px}.pp .tot div{display:flex;justify-content:space-between;padding:3px 0}
  .pp .tot .g{border-top:2px solid #050508;font:400 26px 'Bebas Neue',Arial;letter-spacing:1px;margin-top:4px;padding-top:6px}
  .pp .term{font-size:11.5px;color:#4b5060;white-space:pre-line;margin-top:6px}
  .pp .ft{background:#050508;color:#fff;padding:14px 34px;display:flex;justify-content:space-between;font-size:14px}.pp .ft b{color:#00e5ff}
  </style><div class="pp">
  <div class="hd"><div class="brand">EXCESS <b>MÓVIL DISCO</b></div><div class="no"><strong>COTIZACIÓN ${esc(q.numero)}</strong>Emitida: ${fechaLarga(q.creada)}<br>Válida hasta: ${fechaLarga(vence)}</div></div>
  <div class="bd">
   <div class="two"><div><h4>Cliente</h4><b>${esc(q.cliente.nombre)}</b><br>${esc(q.cliente.tel)}${q.cliente.email ? '<br>' + esc(q.cliente.email) : ''}</div>
   <div><h4>Evento</h4><b>${esc(ev.tipo || 'Evento')}</b> · ${fechaLarga(ev.fecha)}<br>${esc(ev.inicio || '')}${ev.fin ? ' a ' + esc(ev.fin) : ''}${ev.personas ? ' · ' + esc(ev.personas) + ' personas' : ''}<br>${esc(ev.lugar || '')}</div></div>
   ${q.incluye?.length ? `<h4>${q.paquete ? 'Paquete ' + esc(q.paquete) + ' incluye' : 'Incluye'}</h4><ul class="inc">${q.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
   <h4>Detalle</h4><table><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>
   ${q.items.map((i) => `<tr><td>${esc(i.desc)}</td><td class="r">${i.qty}</td><td class="r">${Q(i.precio)}</td><td class="r">${Q(i.qty * i.precio)}</td></tr>`).join('')}</tbody></table>
   <div class="tot"><div><span>Subtotal</span><span>${Q(c.sub)}</span></div>${q.descuento ? `<div><span>Descuento</span><span>− ${Q(q.descuento)}</span></div>` : ''}<div class="g"><span>TOTAL</span><span>${Q(c.total)}</span></div>
   <div><span>Anticipo para reservar (${q.anticipoPct}%)</span><b>${Q(c.anticipo)}</b></div><div><span>Saldo el día del evento</span><span>${Q(r2(c.total - c.anticipo))}</span></div></div>
   ${q.notaCliente ? `<h4>Notas</h4><div class="term">${esc(q.notaCliente)}</div>` : ''}
   <h4>Condiciones</h4><div class="term">${esc(S.interno.terminos)}</div>
  </div>
  <div class="ft"><span>Atiende: <b>${esc(em.nombre)}</b>${em.cargo ? ' · ' + esc(em.cargo) : ''}</span><span>Cel. <b>${esc(em.tel)}</b>${em.email ? ' · ' + esc(em.email) : ''}</span></div></div>`;
}
const loadJS = (src) => new Promise((ok, no) => { if ([...document.scripts].some((s) => s.src === src)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
async function exportPDF(q) {
  const host = $('#paperHost'); host.innerHTML = paperHTML(q);
  try {
    await loadJS('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    await loadJS('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (document.fonts) await document.fonts.ready;
    const canvas = await html2canvas(host.firstElementChild.nextElementSibling || host, { scale: 2, backgroundColor: '#fff' });
    const { jsPDF } = window.jspdf, pdf = new jsPDF('p', 'mm', 'a4');
    const W = 210, H = 297, imgH = canvas.height * W / canvas.width;
    if (imgH <= H * 1.08) pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, Math.min(imgH, H));
    else {
      const pagePx = Math.floor(canvas.width * H / W);
      for (let y = 0, p = 0; y < canvas.height; y += pagePx, p++) {
        const part = document.createElement('canvas'); part.width = canvas.width; part.height = Math.min(pagePx, canvas.height - y);
        part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (p) pdf.addPage(); pdf.addImage(part.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, part.height * W / canvas.width);
      }
    }
    pdf.save(`Cotizacion-${q.numero}-${(q.cliente.nombre || '').replace(/[^\w]+/g, '_')}.pdf`);
  } catch (e) {
    const w = window.open('', '_blank'); if (w) { w.document.write('<!doctype html><meta charset="utf-8"><title>' + q.numero + '</title>' + paperHTML(q)); w.document.close(); toast('Se abrió la vista imprimible: usa Imprimir → Guardar como PDF'); }
    else toast('No se pudo generar el PDF');
  }
  host.innerHTML = '';
}

// ───────── PAQUETES WEB ─────────
function vPaq(v) {
  v.innerHTML = `<div class="bar"><h2>Paquetes del sitio web</h2><div style="display:flex;gap:.5rem;flex-wrap:wrap">
    ${S.paquetes.length ? '' : '<button class="btn btn-pink" data-seedpaq>Importar los 4 paquetes actuales</button>'}
    <button class="btn btn-primary" data-addpaq>+ Nuevo paquete</button></div></div>
    <p class="muted">Lo que guardes aquí se muestra en la página pública (sección Paquetes y selector del formulario) al instante.</p>
    <div class="grid g3 mt" id="paqGrid">${S.paquetes.map((p, n) => `
    <div class="card" data-id="${p.id}">
      <label>Nombre<input data-f="nombre" value="${esc(p.nombre)}"></label>
      <label class="mt">Precio (Q)<input data-f="precio" type="number" min="0" step="1" value="${p.precio ?? 0}"></label>
      <label class="mt">Destacado<select data-f="destacado"><option value="">Normal</option><option value="popular" ${p.destacado === 'popular' ? 'selected' : ''}>Más popular</option><option value="vip" ${p.destacado === 'vip' ? 'selected' : ''}>VIP (magenta)</option></select></label>
      <label class="mt">Incluye (una línea por elemento)<textarea data-f="items" style="min-height:170px">${esc((p.items || []).join('\n'))}</textarea></label>
      <label class="mt">Mensaje de WhatsApp (opcional)<input data-f="wa" value="${esc(p.wa || '')}" placeholder="Hola! Me interesa el Paquete ${esc(p.nombre)}"></label>
      <label class="mt" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:.5rem"><input type="checkbox" data-f="activo" style="width:auto" ${p.activo !== false ? 'checked' : ''}> Visible en el sitio</label>
      <div class="photo"><div class="acts"><button class="btn btn-sm btn-primary" data-save>Guardar</button><button class="btn btn-sm" data-mv="-1" ${n === 0 ? 'disabled' : ''}>←</button><button class="btn btn-sm" data-mv="1" ${n === S.paquetes.length - 1 ? 'disabled' : ''}>→</button><button class="btn btn-sm btn-danger" data-del>Eliminar</button></div></div>
    </div>`).join('')}</div>`;
  v.oninput = () => { S.dirty = true; };
  v.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.seedpaq !== undefined) { const bt = writeBatch(db); PAQ_ACTUALES.forEach((p, i) => bt.set(doc(collection(db, 'paquetes')), { ...p, orden: i, activo: true })); await bt.commit(); return toast('Paquetes importados'); }
    if (b.dataset.addpaq !== undefined) { await setDoc(doc(collection(db, 'paquetes')), { nombre: 'Nuevo', precio: 0, destacado: '', items: [], orden: S.paquetes.length, activo: false }); return toast('Paquete creado (oculto hasta que lo actives)'); }
    const card = b.closest('.card'); if (!card) return; const id = card.dataset.id, p = S.paquetes.find((x) => x.id === id);
    if (b.dataset.save !== undefined) {
      const g = (f) => card.querySelector(`[data-f="${f}"]`);
      await setDoc(doc(db, 'paquetes', id), { nombre: g('nombre').value.trim(), precio: Number(g('precio').value) || 0, destacado: g('destacado').value, items: g('items').value.split('\n').map((s) => s.trim()).filter(Boolean), wa: g('wa').value.trim(), activo: g('activo').checked, orden: p.orden ?? 0 });
      S.dirty = false; toast('Paquete guardado');
    }
    if (b.dataset.mv) { const j = S.paquetes.findIndex((x) => x.id === id) + +b.dataset.mv, o = S.paquetes[j]; if (!o) return; const bt = writeBatch(db); bt.update(doc(db, 'paquetes', id), { orden: j }); bt.update(doc(db, 'paquetes', o.id), { orden: j - +b.dataset.mv }); await bt.commit(); S.dirty = false; }
    if (b.dataset.del !== undefined) { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Seguro?'; return; } await deleteDoc(doc(db, 'paquetes', id)); S.dirty = false; }
  };
}

// ───────── GALERÍA ─────────
function aImagen(fileOrUrl, max = 1280, calidad = 0.78) {
  return new Promise((ok, no) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = calidad, d = c.toDataURL('image/jpeg', q);
      while (d.length > 700000 && q > 0.4) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
      d.length > 950000 ? no(new Error('Imagen demasiado pesada')) : ok(d);
    };
    img.onerror = () => no(new Error('No se pudo leer la imagen'));
    img.src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  });
}
function vGal(v) {
  v.innerHTML = `<div class="bar"><h2>Galería pública</h2>${S.galeria.length ? '' : '<button class="btn btn-pink" data-seedgal>Cargar las 5 fotos actuales del sitio</button>'}</div>
  <label class="drop" for="fileIn">＋ Toca o arrastra fotos aquí (se optimizan solas a ~1280 px)<input id="fileIn" type="file" accept="image/*" multiple hidden></label>
  <div class="photos mt">${S.galeria.map((f, n) => `<div class="card photo" data-id="${f.id}"><img src="${imgSrc(f.src)}" alt="">
    <label class="mt">Descripción<input data-f="alt" value="${esc(f.alt || '')}"></label>
    <label class="mt">Tamaño<select data-f="forma"><option value="">Normal</option><option value="wide" ${f.forma === 'wide' ? 'selected' : ''}>Ancha</option><option value="tall" ${f.forma === 'tall' ? 'selected' : ''}>Alta</option></select></label>
    <label class="mt" style="grid-auto-flow:column;justify-content:start;align-items:center;gap:.5rem"><input type="checkbox" data-f="activo" style="width:auto" ${f.activo !== false ? 'checked' : ''}> Visible</label>
    <div class="acts"><button class="btn btn-sm btn-primary" data-save>Guardar</button><button class="btn btn-sm" data-mv="-1" ${n === 0 ? 'disabled' : ''}>←</button><button class="btn btn-sm" data-mv="1" ${n === S.galeria.length - 1 ? 'disabled' : ''}>→</button><button class="btn btn-sm btn-danger" data-del>Eliminar</button></div></div>`).join('')}</div>`;
  const subir = async (files) => {
    let n = S.galeria.length; toast('Subiendo…');
    for (const f of files) { try { const src = await aImagen(f); await setDoc(doc(collection(db, 'galeria')), { src, alt: '', forma: '', activo: true, orden: n++ }); } catch (e) { toast(f.name + ': ' + e.message); } }
    toast('Listo');
  };
  $('#fileIn').onchange = (e) => subir([...e.target.files]);
  const dz = $('.drop'); dz.ondragover = (e) => e.preventDefault(); dz.ondrop = (e) => { e.preventDefault(); subir([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); };
  v.oninput = () => { S.dirty = true; };
  v.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.seedgal !== undefined) {
      const bt = writeBatch(db); ['foto1.jpeg', 'foto2.jpeg', 'foto3.jpeg', 'foto4.jpg', 'foto5.jpg'].forEach((n, i) => bt.set(doc(collection(db, 'galeria')), { src: 'imagenes/' + n, alt: '', forma: '', activo: true, orden: i }));
      await bt.commit(); return toast('Fotos actuales cargadas');
    }
    const card = b.closest('.card'); if (!card) return; const id = card.dataset.id, f = S.galeria.find((x) => x.id === id);
    if (b.dataset.save !== undefined) { const g = (k) => card.querySelector(`[data-f="${k}"]`); const { id: _omit, ...resto } = f; await setDoc(doc(db, 'galeria', id), { ...resto, alt: g('alt').value.trim(), forma: g('forma').value, activo: g('activo').checked }); S.dirty = false; toast('Foto guardada'); }
    if (b.dataset.mv) { const j = S.galeria.findIndex((x) => x.id === id) + +b.dataset.mv, o = S.galeria[j]; if (!o) return; const bt = writeBatch(db); bt.update(doc(db, 'galeria', id), { orden: j }); bt.update(doc(db, 'galeria', o.id), { orden: j - +b.dataset.mv }); await bt.commit(); S.dirty = false; }
    if (b.dataset.del !== undefined) { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Seguro?'; return; } await deleteDoc(doc(db, 'galeria', id)); S.dirty = false; }
  };
}

// ───────── AJUSTES ─────────
function vAjustes(v) {
  const I = S.interno, st = S.sitio;
  v.innerHTML = `<div class="bar"><h2>Ajustes</h2></div>
  <div class="grid g2">
   <div class="card"><h3>Sitio público</h3>
    <label class="mt">WhatsApp de contacto (con código de país)<input id="sWa" value="${esc(st.whatsapp || '50240564500')}"></label>
    <label class="mt">Texto bajo "Paquetes"<input id="sDesc" value="${esc(st.descPaquetes ?? 'Todos incluyen 5 horas de servicio, música al gusto del cliente')}"></label>
    <label class="mt">Nota bajo la galería<input id="sNota" value="${esc(st.notaGaleria ?? '💡 Imagenes solo con fines ilustrativos')}"></label>
    <button class="btn btn-primary mt" data-save-sitio>Guardar sitio</button></div>
   <div class="card"><h3>Cotizaciones</h3>
    <div class="row mt"><label>Anticipo %<input id="iAnt" type="number" value="${I.anticipoPct}"></label><label>Vigencia (días)<input id="iVig" type="number" value="${I.vigenciaDias}"></label></div>
    <label class="mt">Condiciones (salen en el PDF)<textarea id="iTer" style="min-height:160px">${esc(I.terminos)}</textarea></label></div>
   <div class="card"><h3>Quién emite (nombre y contacto en el PDF)</h3>
    <div id="emis">${I.emisores.map((e) => `<div class="row mt" data-e="${e.id}"><label>Nombre<input data-f="nombre" value="${esc(e.nombre)}"></label><label>Cargo (opcional)<input data-f="cargo" value="${esc(e.cargo || '')}"></label><label>Teléfono<input data-f="tel" value="${esc(e.tel)}"></label><label>Correo<input data-f="email" value="${esc(e.email || '')}"></label></div>`).join('')}</div>
    <button class="btn btn-sm mt" data-add-em>+ Agregar persona</button></div>
   <div class="card"><h3>Artículos adicionales</h3>
    <div id="arts">${I.articulos.map((a) => `<div class="row mt" data-a="${a.id}"><label>Descripción<input data-f="desc" value="${esc(a.desc)}"></label><label>Precio<input data-f="precio" type="number" value="${a.precio}"></label></div>`).join('')}</div>
    <button class="btn btn-sm mt" data-add-art>+ Agregar artículo</button></div>
  </div>
  <button class="btn btn-primary mt" data-save-int>Guardar ajustes de cotización</button>
  <div class="card mt"><h3>Respaldo</h3><p class="muted">Cotizaciones, pagos y ajustes viven solo en este navegador. Descarga un respaldo de vez en cuando (y úsalo para pasarlos a otro equipo).</p>
   <div class="bar mt" style="justify-content:flex-start"><button class="btn" data-bk-out>Descargar respaldo</button><label class="btn" style="text-transform:none;letter-spacing:0;color:#fff;font-size:.95rem">Restaurar respaldo<input type="file" accept=".json" id="bkIn" hidden></label><button class="btn btn-danger" data-reset-pub>Descartar cambios sin publicar</button></div></div>`;
  v.oninput = () => { S.dirty = true; };
  $('#bkIn').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await importAll(JSON.parse(await f.text())); S.dirty = false; toast('Respaldo restaurado'); } catch { toast('Archivo inválido'); } };
  v.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.bkOut !== undefined) { const u = URL.createObjectURL(new Blob([JSON.stringify(exportAll())], { type: 'application/json' })); const a = document.createElement('a'); a.href = u; a.download = 'respaldo-excess-' + hoy() + '.json'; a.click(); }
    if (b.dataset.resetPub !== undefined) { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = '¿Seguro? Se pierden los cambios no publicados'; return; } await resetPublic(); await importarPublicado(); S.dirty = false; toast('Se recargó lo publicado'); }
    if (b.dataset.saveSitio !== undefined) { await setDoc(doc(db, 'config', 'sitio'), { whatsapp: $('#sWa').value.replace(/\D/g, ''), descPaquetes: $('#sDesc').value, notaGaleria: $('#sNota').value }); S.dirty = false; toast('Sitio actualizado'); }
    if (b.dataset.addEm !== undefined) { S.interno.emisores.push({ id: 'em-' + uid(), nombre: '', cargo: '', tel: '', email: '' }); S.dirty = false; rerender(true); }
    if (b.dataset.addArt !== undefined) { S.interno.articulos.push({ id: 'a-' + uid(), desc: '', precio: 0 }); S.dirty = false; rerender(true); }
    if (b.dataset.saveInt !== undefined) {
      const emisores = $$('[data-e]').map((r) => ({ id: r.dataset.e, nombre: $('[data-f=nombre]', r).value.trim(), cargo: $('[data-f=cargo]', r).value.trim(), tel: $('[data-f=tel]', r).value.trim(), email: $('[data-f=email]', r).value.trim() })).filter((x) => x.nombre);
      const articulos = $$('[data-a]').map((r) => ({ id: r.dataset.a, desc: $('[data-f=desc]', r).value.trim(), precio: Number($('[data-f=precio]', r).value) || 0 })).filter((x) => x.desc);
      await setDoc(doc(db, 'config', 'interno'), { emisores, articulos, anticipoPct: Number($('#iAnt').value) || 50, vigenciaDias: Number($('#iVig').value) || 15, terminos: $('#iTer').value });
      S.dirty = false; toast('Ajustes guardados');
    }
  };
}
