# Panel de administración · Excess Móvil Disco

Agrega a tu sitio actual un panel en `/admin` para editar paquetes, fotos, hacer cotizaciones, llevar pagos y calendario.

## Archivos nuevos / cambiados
- `admin/index.html`, `admin/admin.css`, `admin/admin.js` → el panel
- `public.js` → el sitio público lee paquetes, fotos y WhatsApp desde Firestore
- `firebase-config.js` → tu configuración de Firebase (hay que llenarla)
- `firestore.rules` → reglas de seguridad
- `index.html`, `script.js` → ajustes pequeños (ids, precios del WhatsApp corregidos, un solo número, comilla sobrante)
- Si Firebase falla o no hay datos, el sitio muestra el contenido estático de siempre.

## Pasos (una sola vez, ~10 min)
1. https://console.firebase.google.com → proyecto nuevo (o el que ya usas).
2. **Authentication → Sign-in method → Google → Activar.**
3. **Authentication → Settings → Authorized domains:** agrega tu dominio de Vercel (ej. `excess-movil-disco.vercel.app`) y el dominio propio si tienes.
4. **Firestore Database → Crear base de datos** (modo producción).
5. **Firestore → Reglas:** pega el contenido de `firestore.rules` y publica. Si tu socio también va a entrar, agrega su correo en esa lista **y** en `ADMIN_EMAILS` de `firebase-config.js`.
6. **Configuración del proyecto → Tus apps → Web (</>)** → copia `firebaseConfig` en `firebase-config.js`.
7. Sube todo a GitHub; Vercel despliega solo.
8. Entra a `tu-sitio/admin`, inicia con Google y:
   - **Paquetes web → Importar los 4 paquetes actuales.**
   - **Galería → Importar las 5 fotos actuales** (o sube nuevas).
   - **Ajustes →** revisa el WhatsApp, emisores (Rodrigo / Alexia), artículos y condiciones.

## Notas
- **Fotos:** se reducen a ~1280 px y se guardan dentro de Firestore (no requieren Firebase Storage ni plan de pago). Sirve para decenas de fotos; si algún día son cientos, conviene migrar a Storage/Cloudinary.
- **Seguridad:** la clave de `firebaseConfig` es pública por diseño. Lo que protege los datos son las reglas: el público solo lee paquetes, galería y `config/sitio`; cotizaciones, pagos y ajustes internos son solo para los correos admin.
- **Número de WhatsApp:** el sitio usaba 4056-4500 en los botones y 5309-1066 en el formulario. Ahora todo usa el número de *Ajustes* (por defecto 4056-4500). Cámbialo ahí si el del formulario era el correcto.
- Cotizaciones: numeración `EXC-0001…`, estados borrador/enviada/confirmada/rechazada/cancelada, aviso si confirmas una fecha que ya está ocupada, PDF A4 con el nombre y teléfono de quien emite.
- El panel lleva `noindex`, pero no está enlazado desde el sitio; entra escribiendo la ruta.
