/**
 * Correo de recuperación y restablecimiento de contraseña.
 *
 * El correo NO se guarda en Firestore. Vive en Cloudflare D1, detrás del
 * Worker (auth-worker/), por dos razones:
 *   1. En Firestore, usuarios/{id} lo puede leer cualquier cuenta autenticada
 *      —incluso anónima—, así que un correo ahí quedaría a la vista de todo
 *      el reto. En D1 solo lo lee el Worker.
 *   2. El proyecto se está moviendo de Firebase a Cloudflare.
 *
 * Todas las operaciones sobre el correo van firmadas con el ID token de
 * Firebase Auth: el email sintético de la cuenta demuestra de qué perfil
 * eres dueño, así nadie registra un correo en cuenta ajena.
 */
import { auth } from '../firebase';

const AUTH_WORKER = 'https://auth-retogymfit.logidma.com';

/** Validación básica; la definitiva la hacen el Worker y el propio Brevo. */
export function correoValido(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(email || '').trim());
}

async function pedir(ruta, cuerpo, conToken = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (conToken) {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('sin_sesion');
    headers.Authorization = `Bearer ${idToken}`;
  }
  const res = await fetch(`${AUTH_WORKER}${ruta}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...datos };
}

/** El correo registrado del participante actual, o null si no tiene. */
export async function obtenerCorreo(retoId, usuarioId) {
  try {
    const r = await pedir('/correo/leer', { retoId, usuarioId }, true);
    return r.ok ? r.correo || null : null;
  } catch {
    // Sin sesión o sin red: para la app equivale a no tener correo.
    return null;
  }
}

/** Registra o actualiza el correo del participante actual. */
export async function guardarCorreo(retoId, usuarioId, email) {
  const limpio = String(email).trim().toLowerCase();
  if (!correoValido(limpio)) throw new Error('correo_invalido');
  const r = await pedir('/correo/guardar', { retoId, usuarioId, email: limpio }, true);
  if (!r.ok) throw new Error(r.error || 'no_se_pudo_guardar');
  return r.correo;
}

/** Quita el correo registrado. */
export async function borrarCorreo(retoId, usuarioId) {
  const r = await pedir('/correo/borrar', { retoId, usuarioId }, true);
  if (!r.ok) throw new Error(r.error || 'no_se_pudo_borrar');
}

/**
 * Pide el código de recuperación. Sin token: quien lo pide, por definición,
 * no puede entrar a su cuenta.
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
