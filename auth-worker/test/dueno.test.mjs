// Los usuarioId reales SIEMPRE son slugs (slugNombre en sheets.js / slug_ en
// SheetsBridge.gs): minúsculas, sin acentos, no-alfanumérico → guion.
const slugNombre = (u) => u.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const esUsuarioValido = (u) => typeof u === 'string' && /^[a-z0-9-]{1,80}$/.test(u);

function esDuenoDelPerfil(emailToken, retoId, usuarioId) {
  const patron = new RegExp(
    `^u-${slugNombre(usuarioId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-r\\d+)?@${retoId}\\.retogymfit\\.app$`,
  );
  return patron.test(emailToken);
}

const casos = [
  ['u-juan-perez@mixto.retogymfit.app',           'mixto', 'juan-perez', true,  'dueño, gen 0'],
  ['u-juan-perez-r3@mixto.retogymfit.app',        'mixto', 'juan-perez', true,  'dueño, tras 3 reinicios'],
  ['u-juan-perez@damas.retogymfit.app',           'mixto', 'juan-perez', false, 'cruzar de reto'],
  ['u-maria-lopez@mixto.retogymfit.app',          'mixto', 'juan-perez', false, 'suplantar a otro'],
  ['u-juan-perez@mixto.retogymfit.app.evil.com',  'mixto', 'juan-perez', false, 'sufijo malicioso'],
  ['xu-juan-perez@mixto.retogymfit.app',          'mixto', 'juan-perez', false, 'prefijo malicioso'],
  ['u-juan-perezx@mixto.retogymfit.app',          'mixto', 'juan-perez', false, 'nombre extendido'],
  ['u-juan-perez-rx@mixto.retogymfit.app',        'mixto', 'juan-perez', false, 'generación no numérica'],
  ['admin@retogymfit.app',                        'mixto', 'juan-perez', false, 'el admin no es el dueño'],
  ['u-juan-perez@mixto.retogymfit.app',           'mixto', 'juan-pere',  false, 'id truncado'],
];

const validos = [
  ['juan-perez', true, 'slug normal'],
  ['maria-jose-nunez', true, 'slug largo'],
  ['bob', true, 'slug corto'],
  ['Juan Pérez', false, 'nombre sin slugificar'],
  ['../otro', false, 'travesía de ruta'],
  ['juan perez', false, 'con espacio'],
  ['', false, 'vacío'],
  ['a'.repeat(81), false, 'demasiado largo'],
];

let fallos = 0;
console.log('  esDuenoDelPerfil:');
for (const [email, reto, uid, esperado, desc] of casos) {
  const real = esDuenoDelPerfil(email, reto, uid);
  if (real !== esperado) fallos++;
  console.log(`    ${real === esperado ? '✓' : '✗ FALLO'}  ${desc.padEnd(26)} → ${real}`);
}
console.log('  esUsuarioValido:');
for (const [uid, esperado, desc] of validos) {
  const real = esUsuarioValido(uid);
  if (real !== esperado) fallos++;
  console.log(`    ${real === esperado ? '✓' : '✗ FALLO'}  ${desc.padEnd(26)} → ${real}`);
}
console.log(fallos === 0 ? `\n  ✓ los ${casos.length + validos.length} casos pasan` : `\n  ✗ ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
