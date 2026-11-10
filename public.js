// Sitio público: lee paquetes, galería y datos de contacto desde Firestore.
// Si Firebase no está configurado o falla, se queda el contenido estático del HTML.
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => 'Q.' + Number(n || 0).toLocaleString('en-US');

async function init() {
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('PEGAR')) return;
  const db = getFirestore(initializeApp(firebaseConfig));

  const [pq, gl, st] = await Promise.all([
    getDocs(collection(db, 'paquetes')),
    getDocs(collection(db, 'galeria')),
    getDoc(doc(db, 'config', 'sitio')),
  ]);
  const sitio = st.exists() ? st.data() : {};
  const wa = (sitio.whatsapp || '50240564500').replace(/\D/g, '');
  window.WA_NUMBER = wa;

  // ── Paquetes ──
  const paquetes = pq.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.activo !== false).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (paquetes.length) {
    const grid = document.getElementById('paquetes-grid');
    grid.innerHTML = paquetes.map((p) => {
      const cls = p.destacado === 'popular' ? ' paquete--popular' : p.destacado === 'vip' ? ' paquete--vip' : '';
      const [ent, dec] = Number(p.precio || 0).toFixed(2).split('.');
      const msg = p.wa || `Hola! Me interesa el Paquete ${p.nombre} de ${money(p.precio)}`;
      return `<div class="paquete${cls}">
        ${p.destacado === 'popular' ? '<div class="paquete-badge">MÁS POPULAR</div>' : ''}
        <div class="paquete-tag">${esc(String(p.nombre).toUpperCase())}</div>
        <div class="paquete-precio">Q.${Number(ent).toLocaleString('en-US')}<span>.${dec}</span></div>
        <ul class="paquete-items">${(p.items || []).map((i) => `<li><span class="dot"></span>${esc(i)}</li>`).join('')}</ul>
        <a href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" class="paquete-cta">Solicitar →</a>
      </div>`;
    }).join('');

    const sel = document.getElementById('paquete');
    if (sel) {
      sel.innerHTML = '<option value="">Seleccionar...</option>' +
        paquetes.map((p) => `<option>${esc(p.nombre)} — ${money(p.precio)}</option>`).join('') +
        '<option>Otro / Consultar</option>';
    }
  }
  if (sitio.descPaquetes) document.getElementById('paquetes-desc').textContent = sitio.descPaquetes;

  // ── Galería ──
  const fotos = gl.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((f) => f.activo !== false && f.src).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (fotos.length) {
    document.getElementById('gallery-grid').innerHTML = fotos.map((f) => {
      const k = f.forma === 'wide' ? ' gallery-item--wide' : f.forma === 'tall' ? ' gallery-item--tall' : '';
      return `<div class="gallery-item${k}"><img src="${f.src}" alt="${esc(f.alt || 'Excess Móvil Disco')}" loading="lazy" /><div class="gallery-overlay"><span>${esc(f.alt || '')}</span></div></div>`;
    }).join('');
  }
  if (sitio.notaGaleria !== undefined) document.getElementById('gallery-hint').textContent = sitio.notaGaleria;

  // Enlaces generales de WhatsApp
  document.querySelectorAll('a[href^="https://wa.me/50240564500"]').forEach((a) => {
    a.href = a.href.replace('50240564500', wa);
  });
  window.revealEls && window.revealEls(document);
}

init().catch((e) => console.warn('Contenido dinámico no disponible, se usa el estático.', e));
