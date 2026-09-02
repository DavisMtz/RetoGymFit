/**
 * Estado del tema patrio: tres capas de control, en este orden.
 *
 *   1. FECHA      — solo septiembre. Fuera de ahí no hay tema que valga.
 *   2. GLOBAL     — el admin puede apagarlo para todo el reto desde su panel
 *                   (campo `temaPatrio` en el documento retos/{retoId}, que
 *                   ya es legible por cualquier autenticado y escribible solo
 *                   por el admin: no hizo falta tocar firestore.rules).
 *   3. PERSONAL   — cada quien puede apagarlo para sí desde Perfil.
 *
 * Las tres se resuelven SIEMPRE juntas (`decidirPatrio`, en config/patrio.js)
 * y el resultado se aplica en un solo lugar: `aplicarPatrio`.
 *
 * Apagar el tema tiene que apagarlo TODO, y el tema son dos cosas, no una:
 *   · el CSS, que cuelga de html[data-patrio='on'];
 *   · lo que React monta aparte — la guirnalda de papel picado.
 * Por eso `aplicarPatrio` avisa a quien se haya suscrito (`suscribirPatrio`).
 * Antes solo quitaba el atributo: el papel picado se quedaba colgado y encima
 * sin el padding que le hacía hueco, así que terminaba tapando la cabecera.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { hoyMX } from './dates';
import { esMesPatrio, decidirPatrio, CONFETI_PATRIO } from '../config/patrio';

const KEY_PREF = 'rgf_patrio_v1';   // 'on' | 'off' — preferencia personal
const KEY_VISTO = 'rgf_patrio_visto_v1'; // año en que ya vio el modal

/**
 * Último valor conocido del interruptor del admin. Se recuerda porque el
 * interruptor personal de Perfil tiene que respetarlo sin volver a la red:
 * si el admin apagó el tema para el reto, activarlo en tu perfil no enciende
 * nada — que es justo lo que su panel promete.
 */
let globalActivo = true;

/* ── quién quiere enterarse de que el tema cambió ───────────────────── */

const oyentes = new Set();

/** Se suscribe a los cambios del tema. Devuelve la baja, para el cleanup. */
export function suscribirPatrio(fn) {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

/* ── preferencia personal ───────────────────────────────────────────── */

export function prefiereePatrio() {
  try { return localStorage.getItem(KEY_PREF) !== 'off'; } catch { return true; }
}

/**
 * Guarda la preferencia personal y vuelve a resolver las tres capas.
 * Devuelve si el tema quedó encendido DE VERDAD (no es lo mismo que `activo`:
 * la fecha y el interruptor del admin siguen mandando).
 */
export function guardarPreferencia(activo) {
  try { localStorage.setItem(KEY_PREF, activo ? 'on' : 'off'); } catch { /* modo privado */ }
  return aplicarPatrio(decidirPatrio(hoyMX(), { global: globalActivo, personal: activo }));
}

/* ── modal de bienvenida: una sola vez por temporada ────────────────── */

/** El año se usa como marca: en septiembre del año que viene vuelve a salir. */
export function yaVioBienvenida(ymd = hoyMX()) {
  try { return localStorage.getItem(KEY_VISTO) === String(ymd).slice(0, 4); } catch { return true; }
}

export function marcarBienvenidaVista(ymd = hoyMX()) {
  try { localStorage.setItem(KEY_VISTO, String(ymd).slice(0, 4)); } catch { /* modo privado */ }
}

/* ── interruptor global del admin ───────────────────────────────────── */

/** ¿El admin dejó el tema encendido para este reto? Por defecto sí. */
export async function patrioGlobalActivo(retoId) {
  try {
    const snap = await getDoc(doc(db, 'retos', retoId));
    // Sin documento o sin el campo: encendido. Solo un false explícito apaga.
    return snap.exists() ? snap.data().temaPatrio !== false : true;
  } catch {
    return true; // sin red: que la fiesta siga
  }
}

/** Solo el admin: enciende o apaga el tema para todo el reto. */
export async function fijarPatrioGlobal(retoId, activo) {
  globalActivo = Boolean(activo);
  await setDoc(doc(db, 'retos', retoId), { temaPatrio: Boolean(activo) }, { merge: true });
}

/* ── aplicación ─────────────────────────────────────────────────────── */

/** Único lugar que enciende o apaga el tema. Devuelve el estado aplicado. */
export function aplicarPatrio(activo) {
  const raiz = document.documentElement;
  if (activo) raiz.dataset.patrio = 'on';
  else delete raiz.dataset.patrio;
  oyentes.forEach((avisar) => avisar(activo));
  return activo;
}

/**
 * Apaga el tema sin tocar la preferencia personal: al cerrar sesión y en el
 * panel de admin, que no lleva tema. La preferencia se respeta al volver.
 */
export function apagarPatrio() {
  return aplicarPatrio(false);
}

/**
 * Resuelve las tres capas y aplica el resultado.
 * Devuelve true si el tema quedó encendido.
 */
export async function resolverPatrio(retoId) {
  const hoy = hoyMX();
  // El interruptor del admin se consulta aunque el tema esté apagado por la
  // preferencia personal: si no, activarlo luego desde Perfil encendería lo
  // que el admin ya había apagado. Fuera de septiembre no hace falta ir.
  globalActivo = esMesPatrio(hoy) ? await patrioGlobalActivo(retoId) : true;
  return aplicarPatrio(decidirPatrio(hoy, { global: globalActivo, personal: prefiereePatrio() }));
}

/* ── orquestación con el resto de la app ────────────────────────────── */

/** ¿Está el tema encendido AHORA? Lee el atributo, la única fuente de verdad. */
export function patrioEncendido() {
  return document.documentElement.dataset.patrio === 'on';
}

/**
 * Colores para cualquier celebración de la app (confeti al cumplir la meta,
 * billetitos del bote, etc.). En septiembre la fiesta se pone tricolor sin
 * que cada pantalla tenga que saber nada del tema patrio.
 */
export function coloresCelebracion(base) {
  return patrioEncendido() ? CONFETI_PATRIO : base;
}
