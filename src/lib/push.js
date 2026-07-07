/**
 * Notificaciones push del reto (FCM Web).
 *
 * El participante activa las notificaciones desde su Perfil: pedimos permiso
 * al navegador, obtenemos el token de FCM (atado al service worker /sw.js) y
 * lo guardamos en su documento (usuarios/{id}.fcmToken). Los recordatorios
 * los envía el Apps Script del proyecto (apps-script/PushReminders.gs).
 */
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { app, db } from '../firebase';
import { VAPID_KEY } from '../config/push';

/** ¿Este navegador puede recibir push y el proyecto tiene VAPID configurada? */
export async function pushDisponible() {
  if (!VAPID_KEY || !('Notification' in window) || !('serviceWorker' in navigator)) return false;
  try { return await isSupported(); } catch { return false; }
}

async function registroSW() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) throw new Error('Service worker no registrado (recarga la app).');
  return reg;
}

/** Pide permiso, obtiene el token FCM y lo guarda en el perfil. */
export async function activarPush(retoId, usuarioId) {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Permiso de notificaciones denegado.');
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: await registroSW(),
  });
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), { fcmToken: token });
  return token;
}

/** Borra el token de FCM y lo quita del perfil. */
export async function desactivarPush(retoId, usuarioId) {
  try { await deleteToken(getMessaging(app)); } catch { /* token ya inválido */ }
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), { fcmToken: deleteField() });
}

/** Mensajes recibidos con la app abierta (primer plano). Devuelve unsubscribe. */
export function alRecibirPush(cb) {
  try {
    return onMessage(getMessaging(app), cb);
  } catch {
    return () => {};
  }
}
