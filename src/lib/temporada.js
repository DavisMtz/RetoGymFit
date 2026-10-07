/**
 * Estado de la temporada de brujas y muertos: tres capas de control.
 *
 *   1. FECHA     — del 1 de octubre al 2 de noviembre.
 *   2. GLOBAL    — el admin puede apagarla para todos los retos desde su
 *                  panel (campo `temaTemporada` en retos/{retoId}, legible por
 *                  cualquier autenticado y escribible solo por el admin: no
 *                  hizo falta tocar firestore.rules).
 *   3. ELECCIÓN  — cada quien escoge 'brujas', 'muertos' o 'off'. Sin
 *                  elección decide la fecha (config/temporada.js).
 *
 * La elección vive en localStorage y NO en usuarios/{id}: ese documento lo
 * lee cualquier cuenta del reto, y cada escritura cuenta contra la cuota
 * diaria de Firestore que este proyecto ya agotó una vez.
 *
 * Las tres se resuelven SIEMPRE juntas (`decidirTemporada`) y el resultado se
 * aplica en un solo lugar: `aplicarTemporada`. Igual que el tema patrio, la
 * temporada son dos mitades —el CSS que cuelga de html[data-temporada] y lo
 * que React monta aparte (luna, papel picado)—, así que `aplicarTemporada`
 * avisa a quien se haya suscrito para que las dos se muevan juntas.
 */
import { doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { hoyMX } from './dates';
import { esTemporada, decidirTemporada, VARIANTES } from '../config/temporada';
import { RETOS } from '../config/retos';

const KEY_ELECCION = 'rgf_temporada_v1';       // 'brujas' | 'muertos' | 'off'
const KEY_VISTO = 'rgf_temporada_visto_v1';    // año en que ya eligió (o cerró el modal)

/** Último valor conocido del interruptor del admin. */
let globalActivo = true;

const oyentes = new Set();
const oyentesGlobal = new Set();

/**
 * Se suscribe al interruptor del admin (no a la variante). Avisa con el valor
 * actual al suscribirse. Perfil lo usa para no ofrecer una elección que no
 * encendería nada.
 */
export function suscribirTemporadaGlobal(fn) {
  oyentesGlobal.add(fn);
  fn(globalActivo);
  return () => { oyentesGlobal.delete(fn); };
}

function avisarGlobal() {
  oyentesGlobal.forEach((avisar) => avisar(globalActivo));
}

/** Se suscribe a la variante que se ve ('brujas' | 'muertos' | null). */
export function suscribirTemporada(fn) {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

/* ── elección personal ──────────────────────────────────────────────── */

/** 'brujas' | 'muertos' | 'off' | null (null = que decida la fecha). */
export function eleccionTemporada() {
  try {
    const v = localStorage.getItem(KEY_ELECCION);
    return v === 'off' || VARIANTES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Guarda la elección y vuelve a resolver las tres capas. Devuelve la
 * variante que quedó a la vista DE VERDAD: la fecha y el admin siguen
 * mandando sobre lo que elijas.
 */
export function elegirTemporada(valor) {
  try { localStorage.setItem(KEY_ELECCION, valor); } catch { /* modo privado */ }
  return aplicarTemporada(decidirTemporada(hoyMX(), { global: globalActivo, eleccion: valor }));
}

/* ── modal de elección: una sola vez por temporada ──────────────────── */

export function yaVioBienvenida(ymd = hoyMX()) {
  try { return localStorage.getItem(KEY_VISTO) === String(ymd).slice(0, 4); } catch { return true; }
}

export function marcarBienvenidaVista(ymd = hoyMX()) {
  try { localStorage.setItem(KEY_VISTO, String(ymd).slice(0, 4)); } catch { /* modo privado */ }
}

/* ── interruptor global del admin ───────────────────────────────────── */

/**
 * Solo el admin: enciende o apaga la temporada en TODOS los retos de una vez,
 * en un solo lote. Lo aprendido con el tema patrio: un interruptor por reto
 * dejaba a medio grupo viendo el tema y parecía que no servía.
 */
export async function fijarTemporadaTodos(activo) {
  const lote = writeBatch(db);
  Object.keys(RETOS).forEach((retoId) => {
    lote.set(doc(db, 'retos', retoId), { temaTemporada: Boolean(activo) }, { merge: true });
  });
  await lote.commit();
  globalActivo = Boolean(activo);
  avisarGlobal();
}

/**
 * Estado EN VIVO del interruptor en cada reto, para el panel de admin:
 * llama a cb con { mixto: true, damas: false }. Sin documento o sin el
 * campo cuenta como encendido, igual que en la app. Devuelve la baja.
 */
export function vigilarTemporadaTodos(cb) {
  const estado = {};
  const bajas = Object.keys(RETOS).map((retoId) => onSnapshot(
    doc(db, 'retos', retoId),
    (snap) => {
      estado[retoId] = snap.exists() ? snap.data().temaTemporada !== false : true;
      cb({ ...estado });
    },
    () => { /* sin red: el panel se queda con lo último que supo */ },
  ));
  return () => bajas.forEach((baja) => baja());
}

/* ── aplicación ─────────────────────────────────────────────────────── */

/** Único lugar que pone o quita la variante. Devuelve lo aplicado. */
export function aplicarTemporada(variante) {
  const raiz = document.documentElement;
  if (variante) raiz.dataset.temporada = variante;
  else delete raiz.dataset.temporada;
  oyentes.forEach((avisar) => avisar(variante || null));
  return variante || null;
}

/** Quita la temporada sin tocar la elección: al cerrar sesión y en el panel de admin. */
export function apagarTemporada() {
  return aplicarTemporada(null);
}

/**
 * Vigila las tres capas mientras la app esté abierta. El interruptor del
 * admin se escucha EN VIVO: apagarla «para todos» la apaga en los teléfonos
 * ya abiertos. Fuera de temporada no hay listener: no gasta ni una lectura.
 */
export function vigilarTemporada(retoId) {
  const hoy = hoyMX();
  const aplicar = () => aplicarTemporada(
    decidirTemporada(hoy, { global: globalActivo, eleccion: eleccionTemporada() }),
  );
  if (!esTemporada(hoy)) { globalActivo = true; avisarGlobal(); aplicar(); return () => {}; }
  return onSnapshot(
    doc(db, 'retos', retoId),
    (snap) => {
      globalActivo = snap.exists() ? snap.data().temaTemporada !== false : true;
      avisarGlobal();
      aplicar();
    },
    () => { aplicar(); }, // sin red: seguimos con lo último que se supo
  );
}

/** La variante que se ve AHORA. Lee el atributo, la única fuente de verdad. */
export function temporadaVisible() {
  const v = document.documentElement.dataset.temporada;
  return VARIANTES.includes(v) ? v : null;
}
