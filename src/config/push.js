/**
 * Configuración de notificaciones push (Firebase Cloud Messaging).
 *
 * VAPID_KEY es la llave pública de Web Push del proyecto. Se obtiene UNA vez:
 *   Firebase Console → ⚙ Project settings → Cloud Messaging →
 *   Web configuration → Web Push certificates → Generate key pair
 * y se pega aquí (o en .env como VITE_FCM_VAPID_KEY). No es secreta.
 *
 * Mientras esté vacía, la app oculta la opción de notificaciones.
 */
export const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY
  || 'BK5oNpG-l3zJGebiTRFVVJjxAFhrF5fSktlAX28rn2Imscw0sS-X4IUoerkK85TgFg0OVy77YHFbTd8dXSCUd9M';
