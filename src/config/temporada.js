/**
 * Temporada de brujas y muertos — del 1 de octubre al 2 de noviembre.
 *
 * Es UNA temporada con DOS variantes, y cada quien elige la suya:
 *
 *   · brujas  — Halloween: noche de luna, niebla, murciélagos y una araña.
 *   · muertos — Día de Muertos tradicional: papel picado con calaveras y
 *               pétalos de cempasúchil, la flor que guía a las almas.
 *
 * Las dos no se mezclan: las calaveras y el cempasúchil son SOLO de muertos;
 * brujas se queda con la luna, los murciélagos y la calabaza.
 *
 * Decisiones de color, para que se entiendan al leer el CSS:
 *
 * · Cada variante tiene su acento para el tema oscuro y otro, más hondo,
 *   para el claro: el naranja calabaza y el oro de cempasúchil que brillan
 *   sobre #0a0a0a caen por debajo de 4.5:1 sobre el #f4f4ef del tema claro.
 *
 * · El tema se apaga solo el 3 de noviembre. No depende de que nadie lo quite.
 */

/** Las dos variantes, en el orden en que se ofrecen. */
export const VARIANTES = ['brujas', 'muertos'];

export const NOMBRES = {
  brujas: 'Noche de brujas',
  muertos: 'Día de Muertos',
};

export const PALETA_BRUJAS = {
  calabaza: '#ff7a1a',     // acento en oscuro (7.6:1 sobre #0a0a0a)
  calabazaHonda: '#b84a00', // acento en claro (4.7:1 sobre #f4f4ef)
  vela: '#ffc46b',         // la luz de adentro de la calabaza
  luna: '#efe6cc',
  noche: '#5b2a86',        // el morado del cielo
  murcielago: '#16121f',
};

export const PALETA_MUERTOS = {
  cempasuchil: '#ffae1a',  // acento en oscuro (10:1 sobre #0a0a0a)
  cempasuchilHondo: '#9c5a00', // acento en claro (4.9:1 sobre #f4f4ef)
  petalo: '#ff8a00',
  morado: '#7b2fbf',       // el color del luto en la ofrenda
  moradoVivo: '#b57cff',
  rosa: '#e4007c',         // rosa mexicano
  verde: '#00a86b',
  azul: '#1fb6d6',
  blanco: '#ffffff',
};

/** Papel picado de ofrenda: morado, rosa, naranja, amarillo, verde, azul y blanco. */
export const COLORES_PAPEL_MUERTOS = [
  PALETA_MUERTOS.morado, PALETA_MUERTOS.rosa, PALETA_MUERTOS.petalo,
  '#ffd23f', PALETA_MUERTOS.verde, PALETA_MUERTOS.azul, PALETA_MUERTOS.blanco,
];

/** Confeti de celebración de cada variante. */
export const CONFETI_BRUJAS = [PALETA_BRUJAS.calabaza, PALETA_BRUJAS.vela, '#9d5cff', '#ffffff'];
export const CONFETI_MUERTOS = [PALETA_MUERTOS.cempasuchil, PALETA_MUERTOS.petalo, PALETA_MUERTOS.rosa, PALETA_MUERTOS.moradoVivo];

const mes = (ymd) => Number(String(ymd).slice(5, 7));
const dia = (ymd) => Number(String(ymd).slice(8, 10));

/** ¿La fecha cae en la temporada? 1 de octubre a 2 de noviembre. Recibe 'YYYY-MM-DD'. */
export function esTemporada(ymd) {
  return mes(ymd) === 10 || (mes(ymd) === 11 && dia(ymd) <= 2);
}

/**
 * La variante que toca si nadie ha elegido: brujas en octubre, muertos el 1
 * y 2 de noviembre. Quien ya eligió se queda con lo suyo.
 */
export function varianteDelDia(ymd) {
  return mes(ymd) === 11 ? 'muertos' : 'brujas';
}

/**
 * Las TRES capas de control resueltas en un solo lugar:
 *
 *   1. FECHA    — solo del 1 de octubre al 2 de noviembre.
 *   2. GLOBAL   — el admin la apagó para todos los retos.
 *   3. ELECCIÓN — 'brujas', 'muertos', 'off' o nada.
 *
 * Nada NO es lo mismo que 'off': nada quiere decir «que decida la fecha».
 * Devuelve la variante que se ve, o null si no se ve ninguna. Vive aquí, sin
 * DOM ni red, para poder probarlo (test/temporada.test.mjs).
 */
export function decidirTemporada(ymd, { global = true, eleccion = null } = {}) {
  if (!esTemporada(ymd) || global === false || eleccion === 'off') return null;
  return VARIANTES.includes(eleccion) ? eleccion : varianteDelDia(ymd);
}

/** El 31 de octubre: la noche grande de brujas. */
export function esNocheDeBrujas(ymd) {
  return mes(ymd) === 10 && dia(ymd) === 31;
}

/** El 1 y el 2 de noviembre: los días grandes de muertos. */
export function esDiaDeMuertos(ymd) {
  return mes(ymd) === 11 && (dia(ymd) === 1 || dia(ymd) === 2);
}

/** Días que faltan para Halloween dentro de octubre; null fuera de octubre. */
export function diasParaHalloween(ymd) {
  return mes(ymd) === 10 ? 31 - dia(ymd) : null;
}

/** Texto del modal donde se elige, según qué tan cerca estén las fechas. */
export function saludoTemporada(ymd) {
  if (esNocheDeBrujas(ymd)) {
    return { titulo: 'Hoy es noche de brujas', texto: 'Salen los murciélagos y mañana se pone la ofrenda. ¿Con cuál entrenas hoy?' };
  }
  if (esDiaDeMuertos(ymd)) {
    return { titulo: 'Llegó el Día de Muertos', texto: 'Se encienden las velas y el cempasúchil marca el camino. Elige cómo se viste tu app.' };
  }
  const faltan = diasParaHalloween(ymd);
  if (faltan !== null && faltan <= 7) {
    return {
      titulo: faltan === 1 ? 'Mañana es Halloween' : `Faltan ${faltan} días para Halloween`,
      texto: 'Hasta el 2 de noviembre la app se viste de temporada. Elige tu estilo.',
    };
  }
  return { titulo: 'Llegó la temporada de brujas y muertos', texto: 'Hasta el 2 de noviembre la app se viste de temporada. Elige tu estilo.' };
}
