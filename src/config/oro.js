/**
 * Tema ORO: la app se viste de oro SOLO para quien va primero en la semana.
 *
 * Decisiones puras (sin DOM ni red) para poder probarlas: ver
 * test/oro.test.mjs. El estado y la aplicación viven en src/lib/oro.js.
 */

/**
 * ¿Este participante va primero en la semana?
 *
 * El ranking ya llega ordenado por días → punto extra → calorías
 * (`agregarRanking` en data/queries.js). Dos condiciones más:
 *  - Con 0 días no hay liderato: el lunes a las 00:00 todos van en cero y
 *    nadie es líder hasta el primer registro de la semana.
 *  - El liderato es EXCLUSIVO: si el segundo empata en los tres criterios,
 *    el orden entre ellos sería arbitrario, así que no lo lleva nadie.
 */
export function esLiderSemanal(ranking, usuarioId) {
  const primero = (ranking || [])[0];
  if (!primero || !usuarioId || !primero.dias) return false;
  if (primero.usuarioId !== usuarioId) return false;
  const segundo = ranking[1];
  if (segundo
    && segundo.dias === primero.dias
    && (segundo.puntosExtra || 0) === (primero.puntosExtra || 0)
    && (segundo.calorias || 0) === (primero.calorias || 0)) return false;
  return true;
}

/**
 * Las dos capas que encienden el oro, resueltas siempre juntas:
 *  - `lider`  — va primero en la semana (lo real).
 *  - `manual` — el admin se lo encendió a mano para probar (campo `temaOro`
 *               del participante). No hace a nadie líder: solo pinta.
 */
export function decidirOro({ lider, manual } = {}) {
  return Boolean(lider) || Boolean(manual);
}
