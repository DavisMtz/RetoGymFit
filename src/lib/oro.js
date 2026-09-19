/**
 * Estado del tema oro (líder de la semana).
 *
 * Mismo molde que el tema patrio (src/lib/patrio.js), con una diferencia:
 * aquí no hay nada que React monte aparte, solo CSS —
 * `html[data-oro='on']` — y un distintivo en la cabecera que se entera por
 * la suscripción. `aplicarOro` es el ÚNICO lugar que enciende o apaga.
 *
 * Quién decide: config/oro.js (`esLiderSemanal`, `decidirOro`).
 */
import { esLiderSemanal, decidirOro } from '../config/oro';

const oyentes = new Set();

/** Se suscribe a los cambios del tema. Devuelve la baja, para el cleanup. */
export function suscribirOro(fn) {
  oyentes.add(fn);
  fn(oroEncendido());
  return () => { oyentes.delete(fn); };
}

/** ¿Está encendido AHORA? El atributo es la única fuente de verdad. */
export function oroEncendido() {
  return document.documentElement.dataset.oro === 'on';
}

/** Único lugar que enciende o apaga el tema. Devuelve el estado aplicado. */
export function aplicarOro(activo) {
  const raiz = document.documentElement;
  if (activo) raiz.dataset.oro = 'on';
  else delete raiz.dataset.oro;
  oyentes.forEach((avisar) => avisar(Boolean(activo)));
  return Boolean(activo);
}

/** Apaga el tema sin decidir nada: cierre de sesión y panel de admin. */
export function apagarOro() {
  return aplicarOro(false);
}

/**
 * Resuelve las dos capas con el ranking semanal que la pantalla YA cargó
 * (Hoy y Ranking lo piden de todos modos: no cuesta una consulta extra).
 * `usuario` es el documento del participante — de ahí sale `temaOro`, el
 * interruptor manual del panel de admin.
 */
export function evaluarOro(ranking, usuario) {
  if (!usuario || usuario.id === '__admin__') return apagarOro();
  return aplicarOro(decidirOro({
    lider: esLiderSemanal(ranking, usuario.id),
    manual: usuario.temaOro === true,
  }));
}
