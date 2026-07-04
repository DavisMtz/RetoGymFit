/**
 * Migración de Google Sheets → Firestore
 *
 * Importa participantes y (opcionalmente) el histórico de registros y pagos
 * desde archivos CSV exportados de tus hojas actuales.
 *
 * Preparación:
 *  1. En cada Google Sheet: Archivo → Descargar → CSV de las pestañas
 *     "Usuarios", "Registros" y "Pagos".
 *  2. Descarga la clave de servicio: Firebase Console → Project settings →
 *     Service accounts → Generate new private key → guárdala como
 *     serviceAccount.json en la raíz del proyecto (está en .gitignore).
 *  3. npm install firebase-admin --no-save
 *
 * Uso:
 *   node scripts/migrar.mjs --reto mixto --usuarios usuarios.csv \
 *        [--registros registros.csv] [--pagos pagos.csv]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];

if (!args.reto || !args.usuarios) {
  console.error('Uso: node scripts/migrar.mjs --reto mixto|damas --usuarios usuarios.csv [--registros registros.csv] [--pagos pagos.csv]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync('serviceAccount.json', 'utf8'))) });
const db = getFirestore();

// Parser CSV simple con soporte de comillas
function parseCSV(texto) {
  const filas = [];
  let fila = [], campo = '', enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((f) => f !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); if (fila.some((f) => f !== '')) filas.push(fila); }
  return filas;
}

const slug = (nombre) => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function normalizarFecha(v) {
  // Acepta 'yyyy-MM-dd', 'dd/MM/yyyy' o fechas tipo '1/15/2026 12:00:00'
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  throw new Error(`Fecha no reconocida: ${v}`);
}

function semanaISO(ymd) {
  const [y, m, dd] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function anioISO(ymd) {
  const [y, m, dd] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

const retoRef = db.collection('retos').doc(args.reto);
await retoRef.set({ id: args.reto, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });

// —— Usuarios: columnas [Nombre, Estado]
const usuarios = parseCSV(readFileSync(args.usuarios, 'utf8')).slice(1);
const porNombre = {};
for (const [nombre, estado] of usuarios) {
  if (!nombre?.trim()) continue;
  const id = slug(nombre);
  porNombre[nombre.trim()] = id;
  await retoRef.collection('usuarios').doc(id).set({
    nombre: nombre.trim(),
    estado: (estado || '').trim() === 'Activo' ? 'Activo' : 'Inactivo',
    authUid: null,
    hasPassword: false,
    creadoEn: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ usuario ${nombre.trim()} → ${id}`);
}

// —— Registros: columnas [Timestamp, Usuario, Fecha, Tipo, Minutos, Kcal, Evidencia, Estatus, Notas]
if (args.registros) {
  const registros = parseCSV(readFileSync(args.registros, 'utf8')).slice(1);
  let n = 0;
  for (const fila of registros) {
    const [ts, usuario, fecha, tipo, minutos, kcal, evidencia, estatus, notas] = fila;
    if (!usuario?.trim() || !fecha) continue;
    const usuarioId = porNombre[usuario.trim()] || slug(usuario);
    const f = normalizarFecha(fecha);
    await retoRef.collection('registros').doc(`${usuarioId}_${f}`).set({
      usuarioId,
      nombre: usuario.trim(),
      fecha: f,
      semanaIso: semanaISO(f),
      anioIso: anioISO(f),
      mes: f.slice(0, 7),
      tipo: (tipo || '').trim(),
      minutos: Number(minutos) || 0,
      calorias: Number(kcal) || 0,
      evidencia: (evidencia || '').trim(),
      estatus: (estatus || '').trim(),
      notas: (notas || '').trim(),
      creadoEn: ts && !isNaN(new Date(ts)) ? new Date(ts) : FieldValue.serverTimestamp(),
      migrado: true,
    });
    n++;
  }
  console.log(`✓ ${n} registros migrados`);
}

// —— Pagos: columnas [Fecha, Usuario, Monto, Notas]
if (args.pagos) {
  const pagos = parseCSV(readFileSync(args.pagos, 'utf8')).slice(1);
  let n = 0;
  for (const [fecha, usuario, monto, notas] of pagos) {
    if (!monto) continue;
    await retoRef.collection('pagos').add({
      fecha: fecha ? normalizarFecha(fecha) : null,
      usuario: (usuario || '').trim(),
      monto: parseFloat(monto) || 0,
      notas: (notas || '').trim(),
      migrado: true,
    });
    n++;
  }
  console.log(`✓ ${n} pagos migrados`);
}

console.log('\nMigración completa 💪');
process.exit(0);
