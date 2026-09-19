/**
 * Pruebas del tema oro: quién va primero en la semana y cuándo NO cuenta.
 * Solo decisiones puras (src/config/oro.js), sin DOM ni red.
 *
 *   node test/oro.test.mjs
 */
import assert from 'node:assert/strict';
import { esLiderSemanal, decidirOro } from '../src/config/oro.js';

let hechas = 0;
function prueba(nombre, fn) {
  fn();
  hechas += 1;
  console.log('  ✓', nombre);
}

const fila = (usuarioId, dias, calorias = 0, puntosExtra = 0) => ({ usuarioId, dias, calorias, puntosExtra });

console.log('esLiderSemanal');

prueba('el primero de la lista lleva el oro', () => {
  const ranking = [fila('ana', 5, 3000), fila('beto', 4, 2000)];
  assert.equal(esLiderSemanal(ranking, 'ana'), true);
  assert.equal(esLiderSemanal(ranking, 'beto'), false);
});

prueba('nadie lo lleva si el líder va en cero días (lunes recién empezado)', () => {
  const ranking = [fila('ana', 0), fila('beto', 0)];
  assert.equal(esLiderSemanal(ranking, 'ana'), false);
});

prueba('empate pleno con el segundo: el oro no es de nadie', () => {
  const ranking = [fila('ana', 4, 2500, 1), fila('beto', 4, 2500, 1)];
  assert.equal(esLiderSemanal(ranking, 'ana'), false);
  assert.equal(esLiderSemanal(ranking, 'beto'), false);
});

prueba('empate en días pero no en calorías: sí hay líder', () => {
  const ranking = [fila('ana', 4, 2600), fila('beto', 4, 2500)];
  assert.equal(esLiderSemanal(ranking, 'ana'), true);
});

prueba('empate en días y calorías, pero no en punto extra: sí hay líder', () => {
  const ranking = [fila('ana', 4, 2500, 1), fila('beto', 4, 2500, 0)];
  assert.equal(esLiderSemanal(ranking, 'ana'), true);
});

prueba('ranking vacío, nulo o sin usuario: nadie', () => {
  assert.equal(esLiderSemanal([], 'ana'), false);
  assert.equal(esLiderSemanal(null, 'ana'), false);
  assert.equal(esLiderSemanal([fila('ana', 3)], null), false);
});

prueba('un solo participante con días sí es líder', () => {
  assert.equal(esLiderSemanal([fila('ana', 2, 900)], 'ana'), true);
});

console.log('decidirOro');

prueba('manda cualquiera de las dos capas', () => {
  assert.equal(decidirOro({ lider: true, manual: false }), true);
  assert.equal(decidirOro({ lider: false, manual: true }), true);
  assert.equal(decidirOro({ lider: false, manual: false }), false);
  assert.equal(decidirOro({}), false);
  assert.equal(decidirOro(), false);
});

console.log(`\n✓ ${hechas} pruebas del tema oro`);
