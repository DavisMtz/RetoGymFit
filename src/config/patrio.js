/**
 * Tema patrio — septiembre mexicano.
 *
 * Decisiones de diseño, para que se entiendan al leer el CSS:
 *
 * · LOS COLORES DE LA BANDERA NO SE USAN TAL CUAL PARA TEXTO. El verde
 *   oficial (#006847) y el rojo (#CE1126) sobre el fondo #0a0a0a de la app
 *   dan un contraste de ~2:1 — ilegible. Cada uno tiene dos versiones: la
 *   fiel, para rellenos decorativos donde el contraste da igual (papel
 *   picado, franjas), y una aclarada para acentos y texto.
 *
 * · NO SE REPRODUCE EL ESCUDO NACIONAL. La Ley sobre el Escudo, la Bandera
 *   y el Himno Nacionales regula su uso, así que el tema evoca la fiesta con
 *   motivos de artesanía popular —papel picado, franjas de sarape, cohetes—
 *   y no con símbolos oficiales.
 *
 * · El tema se apaga solo el 1 de octubre. No depende de que nadie lo quite.
 */

/** Paleta. `*Vivo` = aclarado para acento/texto; el otro es el color fiel. */
export const PALETA = {
  verde: '#006847',
  verdeVivo: '#00b45e',
  blanco: '#ffffff',
  rojo: '#ce1126',
  rojoVivo: '#ff4d5a',
  oro: '#ffd84d',
  rosa: '#ff5fa2',   // el rosa mexicano de Ramírez Vázquez, para el papel picado
  turquesa: '#00c2c7',
};

/** Colores del papel picado: la gama real de las tiras de plástico y seda. */
export const COLORES_PAPEL = [
  PALETA.verde, PALETA.rosa, PALETA.oro,
  PALETA.rojo, PALETA.turquesa, PALETA.blanco,
];

/** Confeti de celebración en septiembre: verde, blanco y rojo. */
export const CONFETI_PATRIO = [PALETA.verdeVivo, '#ffffff', PALETA.rojoVivo, PALETA.oro];

export const MES_PATRIO = 9;        // septiembre
export const DIA_GRITO = 15;        // la noche del Grito
export const DIA_INDEPENDENCIA = 16;

/** ¿La fecha cae en el mes patrio? Recibe 'YYYY-MM-DD' (hoyMX). */
export function esMesPatrio(ymd) {
  return Number(String(ymd).slice(5, 7)) === MES_PATRIO;
}

/** El Grito y el día de la Independencia: merecen fuegos artificiales. */
export function esNocheDelGrito(ymd) {
  const dia = Number(String(ymd).slice(8, 10));
  return esMesPatrio(ymd) && (dia === DIA_GRITO || dia === DIA_INDEPENDENCIA);
}

/** Días que faltan para el Grito dentro del mismo septiembre; null si ya pasó. */
export function diasParaElGrito(ymd) {
  if (!esMesPatrio(ymd)) return null;
  const faltan = DIA_GRITO - Number(String(ymd).slice(8, 10));
  return faltan >= 0 ? faltan : null;
}

/** Texto del modal de bienvenida, según qué tan cerca esté el Grito. */
export function saludoPatrio(ymd) {
  const faltan = diasParaElGrito(ymd);
  if (esNocheDelGrito(ymd)) {
    return { titulo: '¡Viva México!', texto: 'Hoy es la fiesta grande. La app se puso sus colores para celebrar contigo.' };
  }
  if (faltan === null) {
    return { titulo: 'Sigue el mes patrio', texto: 'Ya pasó el Grito, pero septiembre no termina. La app sigue de fiesta.' };
  }
  if (faltan === 0) {
    return { titulo: 'Hoy es el Grito', texto: 'Esta noche gritamos. La app se vistió de verde, blanco y rojo.' };
  }
  if (faltan <= 7) {
    return { titulo: `Faltan ${faltan} días para el Grito`, texto: 'Ya se siente. La app se vistió de verde, blanco y rojo para el mes patrio.' };
  }
  return { titulo: 'Llegó el mes patrio', texto: 'Septiembre es de fiesta, y la app se vistió de verde, blanco y rojo para acompañarte.' };
}
