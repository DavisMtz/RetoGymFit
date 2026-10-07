/**
 * Colores y formas de cualquier celebración de la app (confeti al cumplir la
 * meta, billetitos del bote, etc.). Cada pantalla pide sus colores aquí y la
 * fiesta se viste de la temporada que esté encendida sin que la pantalla
 * tenga que saber nada de temas.
 *
 * Lee los atributos de <html>, que son la única fuente de verdad de los
 * temas (los ponen lib/patrio.js y lib/temporada.js). Por eso NO importa
 * esos módulos: un tema no tiene por qué depender de otro.
 */
import confetti from 'canvas-confetti';
import { CONFETI_PATRIO } from '../config/patrio';
import { CONFETI_BRUJAS, CONFETI_MUERTOS } from '../config/temporada';

const temporada = () => (typeof document === 'undefined' ? undefined : document.documentElement.dataset.temporada);

export function coloresCelebracion(base) {
  if (typeof document !== 'undefined' && document.documentElement.dataset.patrio === 'on') return CONFETI_PATRIO;
  if (temporada() === 'brujas') return CONFETI_BRUJAS;
  if (temporada() === 'muertos') return CONFETI_MUERTOS;
  return base;
}

/*
 * Formas propias de cada variante: murciélagos en brujas, pétalos de
 * cempasúchil en muertos. Se les da su matriz a mano: sin ella,
 * `shapeFromPath` mide la figura barriendo un lienzo de 1000×1000 punto por
 * punto, y eso se nota justo en el instante de la celebración.
 */
const MURCIELAGO = 'M20 6 C18 4 17 3 17 3 L16.5 6 C13 4 8 3 2 6 C5 7 6 9 6 11 C8 9.5 10 10 11 12 '
  + 'C12.5 10.5 15 10.5 16.5 12.5 C17.5 14 19 15 20 16 C21 15 22.5 14 23.5 12.5 C25 10.5 27.5 10.5 29 12 '
  + 'C30 10 32 9.5 34 11 C34 9 35 7 38 6 C32 3 27 4 23.5 6 L23 3 C23 3 22 4 20 6 Z';
const PETALO = 'M5 14 C3 11 0 7 0.6 3.2 C1.2 1.2 2.4 0.4 3.2 1.4 C3.8 0.2 4.6 -0.2 5 1 '
  + 'C5.4 -0.2 6.2 0.2 6.8 1.4 C7.6 0.4 8.8 1.2 9.4 3.2 C10 7 7 11 5 14 Z';

/** Matriz que centra la figura en el origen y la deja de ~10 px, como las de fábrica. */
const matriz = (cx, cy, lado) => {
  const s = 10 / lado;
  return [s, 0, 0, s, -cx * s, -cy * s];
};

let formas = null;
function crearFormas() {
  if (formas) return formas;
  try {
    formas = {
      brujas: [confetti.shapeFromPath({ path: MURCIELAGO, matrix: matriz(20, 9.5, 36) }), 'circle'],
      muertos: [confetti.shapeFromPath({ path: PETALO, matrix: matriz(5, 7, 14) }), 'circle'],
    };
  } catch {
    formas = {}; // navegador sin Path2D: confeti de siempre
  }
  return formas;
}

/**
 * Opciones extra para `confetti()`, para esparcirlas en la llamada:
 * `confetti({ ...opciones, ...formasCelebracion() })`. Fuera de temporada es
 * un objeto vacío y el confeti sale como siempre. Las figuras van un poco más
 * grandes que los cuadritos: a 10 px un murciélago no se distingue.
 */
export function formasCelebracion() {
  const t = temporada();
  const shapes = t ? crearFormas()[t] : undefined;
  return shapes ? { shapes, scalar: 1.5 } : {};
}
