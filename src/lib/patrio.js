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
 * Se aplica como html[data-patrio='on'], igual que el tema claro/oscuro, para
 * que el CSS haga todo el trabajo y no haya que re-renderizar nada.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { hoyMX } from './dates';
import { esMesPatrio, CONFETI_PATRIO } from '../config/patrio';

const KEY_PREF = 'rgf_patrio_v1';   // 'on' | 'off' — preferencia personal
const KEY_VISTO = 'rgf_patrio_visto_v1'; // año en que ya vio el modal

/* ── preferencia personal ───────────────────────────────────────────── */

export function prefiereePatrio() {
  try { return localStorage.getItem(KEY_PREF) !== 'off'; } catch { return true; }
}

export function guardarPreferencia(activo) {
  try { localStorage.setItem(KEY_PREF, activo ? 'on' : 'off'); } catch { /* modo privado */ }
  aplicarPatrio(activo);
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
  await setDoc(doc(db, 'retos', retoId), { temaPatrio: Boolean(activo) }, { merge: true });
}

/* ── aplicación ─────────────────────────────────────────────────────── */

export function aplicarPatrio(activo) {
  const raiz = document.documentElement;
  if (activo) raiz.dataset.patrio = 'on';
  else delete raiz.dataset.patrio;
}

/**
 * Resuelve las tres capas y aplica el resultado.
 * Devuelve true si el tema quedó encendido.
 */
export async function resolverPatrio(retoId) {
  const hoy = hoyMX();
  if (!esMesPatrio(hoy) || !prefiereePatrio()) { aplicarPatrio(false); return false; }
  const global = await patrioGlobalActivo(retoId);
  aplicarPatrio(global);
  return global;
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
