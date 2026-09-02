/**
 * Correo de recuperación y restablecimiento de contraseña.
 *
 * El correo del participante NO vive en su documento de usuario: ese lo puede
 * leer cualquier cuenta autenticada (incluso anónima), así que estaría a la
 * vista de todo el reto. Vive en `retos/{retoId}/correos/{usuarioId}`, que
 * según firestore.rules solo leen su dueño y el Worker de recuperación.
 *
 * Lo escribe el propio dueño desde Perfil (las reglas verifican que el perfil
 * ya sea suyo). El Worker (auth-worker/) solo lo lee, y únicamente para
 * mandar el código cuando alguien olvidó su contraseña.
 */
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const AUTH_WORKER = 'https://auth-retogymfit.logidma.com';

/** Validación básica; la definitiva la hacen las reglas y el propio Brevo. */
export function correoValido(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(email || '').trim());
}

const refCorreo = (retoId, usuarioId) => doc(db, 'retos', retoId, 'correos', usuarioId);

/** El correo registrado del participante actual, o null si no tiene. */
export async function obtenerCorreo(retoId, usuarioId) {
  try {
    const snap = await getDoc(refCorreo(retoId, usuarioId));
    return snap.exists() ? snap.data().email : null;
  } catch {
    // Sin permiso (no es su perfil) o sin red: para la app equivale a no tener.
    return null;
  }
}

/** Registra o actualiza el correo del participante actual. */
export async function guardarCorreo(retoId, usuarioId, email) {
  const limpio = String(email).trim().toLowerCase();
  if (!correoValido(limpio)) throw new Error('correo_invalido');
  await setDoc(refCorreo(retoId, usuarioId), {
    email: limpio,
    authUid: auth.currentUser.uid,
    actualizadoEn: serverTimestamp(),
  });
  return limpio;
}

/** Quita el correo registrado. */
export async function borrarCorreo(retoId, usuarioId) {
  await deleteDoc(refCorreo(retoId, usuarioId));
}

async function pedir(ruta, cuerpo) {
  const res = await fetch(`${AUTH_WORKER}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...datos };
}

/**
 * Pide el código de recuperación.
 * → { ok:true, tieneCorreo:true, correo:'ju***@gmail.com', expiraEn }
 * → { ok:true, tieneCorreo:false }  (no registró correo: que le escriba al admin)
 */
export function solicitarCodigo(retoId, usuarioId) {
  return pedir('/recuperar/solicitar', { retoId, usuarioId });
}

/**
 * Valida el código. Si cuadra, el Worker libera el perfil y el participante
 * puede crear contraseña nueva por el flujo normal de onboarding.
 */
export function verificarCodigo(retoId, usuarioId, codigo) {
  return pedir('/recuperar/verificar', { retoId, usuarioId, codigo: String(codigo).trim() });
}

/** Mensaje en español para cada error que devuelve el Worker. */
export function mensajeDeError(respuesta) {
  switch (respuesta?.error) {
    case 'espera':
      return `Ya te enviamos uno. Espera ${respuesta.segundos || 60}s para pedir otro.`;
    case 'codigo_incorrecto':
      return respuesta.restantes > 0
        ? `Código incorrecto. Te quedan ${respuesta.restantes} intento${respuesta.restantes === 1 ? '' : 's'}.`
        : 'Código incorrecto.';
    case 'expirado':
      return 'El código caducó. Pide uno nuevo.';
    case 'demasiados_intentos':
      return 'Demasiados intentos. Pide un código nuevo.';
    case 'no_encontrado':
      return 'No encontramos ese perfil.';
    case 'envio_fallido':
      return 'No pudimos enviar el correo. Intenta en un momento.';
    default:
      return 'Algo falló. Intenta de nuevo.';
  }
}
