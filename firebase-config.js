// Pega aquí la configuración de tu proyecto Firebase
// (Consola Firebase → Configuración del proyecto → Tus apps → App web → SDK).
// Estos valores NO son secretos; la seguridad la dan las reglas de Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: "PEGAR_AQUI",
  authDomain: "PEGAR_AQUI.firebaseapp.com",
  projectId: "PEGAR_AQUI",
  appId: "PEGAR_AQUI"
};

// Correos con permiso de administrador (debe coincidir con firestore.rules)
export const ADMIN_EMAILS = ["rodale27@gmail.com"];
