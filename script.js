// ══════════════════════════════════
//   EXCESS MÓVIL DISCO — JS
// ══════════════════════════════════

// ── Partículas de luz en el hero ──
(function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  const colors = ['#00e5ff', '#ff0080', '#ffe100', '#ffffff'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:absolute;
      width:${Math.random() * 3 + 1}px;
      height:${Math.random() * 3 + 1}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:50%;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      opacity:${Math.random() * 0.6 + 0.1};
      animation: float ${Math.random() * 8 + 4}s ease-in-out infinite;
      animation-delay:${Math.random() * -8}s;
    `;
    container.appendChild(p);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes float {
      0%, 100% { transform: translateY(0) translateX(0); }
      33% { transform: translateY(-20px) translateX(10px); }
      66% { transform: translateY(10px) translateX(-10px); }
    }
  `;
  document.head.appendChild(style);
})();


// ── Navbar activo al scrollear ──
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.nav');
  nav.style.background = window.scrollY > 50
    ? 'rgba(5,5,8,0.97)'
    : 'rgba(5,5,8,0.85)';
});


// ── Formulario → WhatsApp ──
function enviarFormulario(e) {
  e.preventDefault();

  const nombre  = document.getElementById('nombre').value.trim();
  const tel     = document.getElementById('telefono').value.trim();
  const fecha   = document.getElementById('fecha').value;
  const paquete = document.getElementById('paquete').value;
  const mensaje = document.getElementById('mensaje').value.trim();

  const texto = `¡Hola! Me interesa contratar Excess Móvil Disco 🎵

👤 *Nombre:* ${nombre}
📱 *Teléfono:* ${tel}
📅 *Fecha del evento:* ${fecha || 'Por definir'}
🎧 *Paquete:* ${paquete || 'Por consultar'}
💬 *Mensaje:* ${mensaje || 'Sin mensaje adicional'}`;

  const url = `https://wa.me/50253091066?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}


// ── Animación al entrar en pantalla ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.paquete, .gallery-item, .contacto-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});
