/**
 * Pruebas del calendario de la temporada de brujas y muertos.
 *
 * Lo que más importa: que se apague SOLA el 3 de noviembre, que una elección
 * explícita gane a la fecha, que «sin elección» no sea lo mismo que «apagada»
 * y que el interruptor del admin mande sobre todo.
 *
 * Se ejecuta con: npm test
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const mod = await import(
  'data:text/javascript,' + encodeURIComponent(readFileSync('src/config/temporada.js', 'utf8'))
);
const {
  esTemporada, varianteDelDia, decidirTemporada, esNocheDeBrujas, esDiaDeMuertos,
  diasParaHalloween, saludoTemporada,
} = mod;

let fallos = 0;
const prueba = (desc, fn) => {
  try { fn(); console.log(`  ✓ ${desc}`); } catch (e) { fallos += 1; console.log(`  ✗ ${desc}\n     ${e.message}`); }
};

console.log('esTemporada — 1 de octubre al 2 de noviembre');
prueba('30 de septiembre: todavía no', () => assert.equal(esTemporada('2026-09-30'), false));
prueba('1 de octubre: empieza', () => assert.equal(esTemporada('2026-10-01'), true));
prueba('31 de octubre: sigue', () => assert.equal(esTemporada('2026-10-31'), true));
prueba('2 de noviembre: último día', () => assert.equal(esTemporada('2026-11-02'), true));
prueba('3 de noviembre: se apaga sola', () => assert.equal(esTemporada('2026-11-03'), false));
prueba('25 de noviembre: apagada', () => assert.equal(esTemporada('2026-11-25'), false));

console.log('varianteDelDia — lo que se ve si nadie elige');
prueba('octubre: brujas', () => assert.equal(varianteDelDia('2026-10-15'), 'brujas'));
prueba('31 de octubre: brujas', () => assert.equal(varianteDelDia('2026-10-31'), 'brujas'));
prueba('1 de noviembre: muertos', () => assert.equal(varianteDelDia('2026-11-01'), 'muertos'));

console.log('decidirTemporada — fecha, admin y elección');
prueba('1 de octubre sin elegir: brujas', () => assert.equal(decidirTemporada('2026-10-01'), 'brujas'));
prueba('1 de noviembre sin elegir: muertos', () => assert.equal(decidirTemporada('2026-11-01'), 'muertos'));
prueba('elegiste muertos en octubre: muertos', () => assert.equal(decidirTemporada('2026-10-07', { eleccion: 'muertos' }), 'muertos'));
prueba('elegiste brujas: la conservas el 2 de noviembre', () => assert.equal(decidirTemporada('2026-11-02', { eleccion: 'brujas' }), 'brujas'));
prueba('la apagaste: nada', () => assert.equal(decidirTemporada('2026-10-07', { eleccion: 'off' }), null));
prueba('el admin la apagó: nada, elijas lo que elijas', () => {
  assert.equal(decidirTemporada('2026-10-07', { global: false, eleccion: 'brujas' }), null);
  assert.equal(decidirTemporada('2026-10-07', { global: false, eleccion: 'muertos' }), null);
  assert.equal(decidirTemporada('2026-10-07', { global: false }), null);
});
prueba('3 de noviembre: nada, aunque hayas elegido', () => assert.equal(decidirTemporada('2026-11-03', { eleccion: 'muertos' }), null));
prueba('30 de septiembre: nada, aunque hayas elegido', () => assert.equal(decidirTemporada('2026-09-30', { eleccion: 'brujas' }), null));
prueba('una elección desconocida cuenta como «sin elegir»', () => assert.equal(decidirTemporada('2026-10-07', { eleccion: 'navidad' }), 'brujas'));

console.log('noches grandes');
prueba('30 de octubre: todavía no es noche de brujas', () => assert.equal(esNocheDeBrujas('2026-10-30'), false));
prueba('31 de octubre: noche de brujas', () => assert.equal(esNocheDeBrujas('2026-10-31'), true));
prueba('1 de noviembre: Día de Muertos', () => assert.equal(esDiaDeMuertos('2026-11-01'), true));
prueba('2 de noviembre: Día de Muertos', () => assert.equal(esDiaDeMuertos('2026-11-02'), true));
prueba('31 de octubre no es Día de Muertos', () => assert.equal(esDiaDeMuertos('2026-10-31'), false));

console.log('diasParaHalloween y saludo');
prueba('7 de octubre: faltan 24', () => assert.equal(diasParaHalloween('2026-10-07'), 24));
prueba('noviembre: null', () => assert.equal(diasParaHalloween('2026-11-01'), null));
prueba('inicio de temporada', () => assert.match(saludoTemporada('2026-10-07').titulo, /temporada/i));
prueba('cuenta regresiva', () => assert.match(saludoTemporada('2026-10-26').titulo, /Faltan 5 días/));
prueba('la víspera', () => assert.match(saludoTemporada('2026-10-30').titulo, /Mañana/));
prueba('el 31', () => assert.match(saludoTemporada('2026-10-31').titulo, /noche de brujas/i));
prueba('el 1 de noviembre', () => assert.match(saludoTemporada('2026-11-01').titulo, /Día de Muertos/));

console.log(fallos === 0 ? '\n✓ todo pasa' : `\n✗ ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
