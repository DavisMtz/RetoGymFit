/**
 * Pruebas del calendario del tema patrio.
 *
 * Lo que más importa aquí es que el tema SE APAGUE SOLO el 1 de octubre:
 * si esa frontera falla, la app se queda de fiesta todo el año y nadie se
 * acuerda de quitarla a mano.
 *
 * Se ejecuta con: npm test
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const mod = await import(
  'data:text/javascript,' + encodeURIComponent(readFileSync('src/config/patrio.js', 'utf8'))
);
const { esMesPatrio, esNocheDelGrito, diasParaElGrito, saludoPatrio } = mod;

let fallos = 0;
const prueba = (desc, fn) => {
  try { fn(); console.log(`  ✓ ${desc}`); } catch (e) { fallos += 1; console.log(`  ✗ ${desc}\n     ${e.message}`); }
};

console.log('esMesPatrio — solo septiembre');
prueba('31 de agosto: apagado', () => assert.equal(esMesPatrio('2026-08-31'), false));
prueba('1 de septiembre: encendido', () => assert.equal(esMesPatrio('2026-09-01'), true));
prueba('30 de septiembre: último día', () => assert.equal(esMesPatrio('2026-09-30'), true));
prueba('1 de octubre: se apaga solo', () => assert.equal(esMesPatrio('2026-10-01'), false));
prueba('diciembre: apagado', () => assert.equal(esMesPatrio('2026-12-25'), false));

console.log('esNocheDelGrito — 15 y 16');
prueba('14 de septiembre: todavía no', () => assert.equal(esNocheDelGrito('2026-09-14'), false));
prueba('15 de septiembre: el Grito', () => assert.equal(esNocheDelGrito('2026-09-15'), true));
prueba('16 de septiembre: Independencia', () => assert.equal(esNocheDelGrito('2026-09-16'), true));
prueba('17 de septiembre: ya pasó', () => assert.equal(esNocheDelGrito('2026-09-17'), false));
prueba('15 de octubre: fuera del mes no cuenta', () => assert.equal(esNocheDelGrito('2026-10-15'), false));

console.log('diasParaElGrito');
prueba('2 de septiembre: faltan 13', () => assert.equal(diasParaElGrito('2026-09-02'), 13));
prueba('15 de septiembre: faltan 0', () => assert.equal(diasParaElGrito('2026-09-15'), 0));
prueba('20 de septiembre: ya pasó → null', () => assert.equal(diasParaElGrito('2026-09-20'), null));
prueba('fuera de septiembre → null', () => assert.equal(diasParaElGrito('2026-05-02'), null));

console.log('saludoPatrio — el texto se adapta al calendario');
prueba('inicio de mes', () => assert.match(saludoPatrio('2026-09-02').titulo, /mes patrio/i));
prueba('cuenta regresiva', () => assert.match(saludoPatrio('2026-09-10').titulo, /Faltan 5 días/));
prueba('el Grito', () => assert.match(saludoPatrio('2026-09-15').titulo, /Viva México/));
prueba('después del Grito', () => assert.match(saludoPatrio('2026-09-22').titulo, /Sigue/));

console.log(fallos === 0 ? '\n✓ todo pasa' : `\n✗ ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
