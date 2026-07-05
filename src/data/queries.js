/**
 * Acceso a Firestore. Estructura:
 *
 *   retos/{retoId}                       → config/estado del reto (opcional)
 *   retos/{retoId}/usuarios/{usuarioId}  → { nombre, estado, authUid, hasPassword }
 *   retos/{retoId}/registros/{id}        → id = `${usuarioId}_${fecha}` (1 por día garantizado)
 *   retos/{retoId}/pagos/{pagoId}        → { fecha, usuario, monto, notas }
 */
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  setDoc, updateDoc, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { hoyMX, semanaISO, anioISO, mesMX, diasDeSemana, lunesDe, sumarDias } from '../lib/dates';

const col = (retoId, sub) => collection(db, 'retos', retoId, sub);

// ——————————————————————————————— USUARIOS

export async function obtenerUsuariosActivos(retoId) {
  const q = query(col(retoId, 'usuarios'), where('estado', '==', 'Activo'));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function obtenerUsuario(retoId, usuarioId) {
  const snap = await getDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Reclama el perfil: asocia la cuenta de Auth al participante (primera vez).
 * Si el participante viene de la hoja de Google y aún no tiene documento
 * en Firestore, lo crea aquí mismo.
 */
export async function reclamarUsuario(retoId, usuarioDoc, authUid) {
  const ref = doc(db, 'retos', retoId, 'usuarios', usuarioDoc.id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { authUid, hasPassword: true, ultimoAcceso: serverTimestamp() });
  } else {
    await setDoc(ref, {
      nombre: usuarioDoc.nombre,
      estado: 'Activo',
      authUid,
      hasPassword: true,
      creadoEn: serverTimestamp(),
      ultimoAcceso: serverTimestamp(),
    });
  }
}

export async function marcarAcceso(retoId, usuarioId, authUid) {
  try {
    await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), {
      authUid,
      hasPassword: true,
      ultimoAcceso: serverTimestamp(),
    });
  } catch { /* no crítico */ }
}

/**
 * Guarda (o quita) la foto de perfil del participante. La foto es un data URL
 * JPEG comprimido que vive en el propio documento del usuario; pasar `null`
 * la elimina. Solo el dueño del perfil puede escribirla (ver firestore.rules).
 */
export async function actualizarFotoPerfil(retoId, usuarioId, fotoDataUrl) {
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), {
    fotoPerfil: fotoDataUrl == null ? deleteField() : fotoDataUrl,
    ultimoAcceso: serverTimestamp(),
  });
}

// ——————————————————————————————— REGISTROS

export function idRegistro(usuarioId, fecha) {
  return `${usuarioId}_${fecha}`;
}

export async function obtenerRegistroHoy(retoId, usuarioId) {
  const snap = await getDoc(doc(db, 'retos', retoId, 'registros', idRegistro(usuarioId, hoyMX())));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Guarda el registro del día. El id determinista `${usuarioId}_${fecha}`
 * + reglas de seguridad "create only" hacen imposible el doble registro.
 */
export async function guardarRegistro(retoId, usuario, datos) {
  const fecha = hoyMX();
  const registro = {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    fecha,
    semanaIso: semanaISO(fecha),
    anioIso: anioISO(fecha),
    mes: fecha.slice(0, 7),
    tipo: datos.tipo,
    minutos: datos.minutos,
    calorias: datos.calorias,
    evidencia: datos.evidencia,
    estatus: datos.estatus,
    notas: datos.notas || '',
    creadoEn: serverTimestamp(),
  };
  await setDoc(doc(db, 'retos', retoId, 'registros', idRegistro(usuario.id, fecha)), registro);
  return registro;
}

/** Cuenta registros de un tipo (para límites: vacaciones/año, periodo/mes) */
export async function contarPorTipo(retoId, usuarioId, tipo, periodo) {
  const hoy = hoyMX();
  const filtros = [where('usuarioId', '==', usuarioId), where('tipo', '==', tipo)];
  if (periodo === 'mensual') filtros.push(where('mes', '==', hoy.slice(0, 7)));
  else filtros.push(where('mes', '>=', `${hoy.slice(0, 4)}-01`), where('mes', '<=', `${hoy.slice(0, 4)}-12`));
  const snap = await getDocs(query(col(retoId, 'registros'), ...filtros));
  return snap.size;
}

export async function obtenerHistorial(retoId, usuarioId, max = 120) {
  const q = query(
    col(retoId, 'registros'),
    where('usuarioId', '==', usuarioId),
    orderBy('fecha', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Semana visual lun-dom del usuario: [{ fecha, dia, estatus }] */
export async function obtenerSemana(retoId, usuarioId) {
  const dias = diasDeSemana(hoyMX());
  const q = query(
    col(retoId, 'registros'),
    where('usuarioId', '==', usuarioId),
    where('fecha', '>=', dias[0]),
    where('fecha', '<=', dias[6]),
  );
  const snap = await getDocs(q);
  const porFecha = {};
  snap.docs.forEach((d) => { porFecha[d.data().fecha] = d.data().estatus; });
  return dias.map((fecha) => ({ fecha, estatus: porFecha[fecha] || 'sin registro' }));
}

// ——————————————————————————————— RANKING

function agregarRanking(docs, metaDias, diaBonus) {
  const stats = {};
  docs.forEach((d) => {
    const r = d.data();
    if (!stats[r.nombre]) stats[r.nombre] = { nombre: r.nombre, usuarioId: r.usuarioId, dias: 0, calorias: 0, fechas: new Set() };
    const s = stats[r.nombre];
    if ((r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO') && !s.fechas.has(r.fecha)) {
      s.fechas.add(r.fecha);
      s.dias += 1;
    }
    if (r.tipo === 'Gimnasio' || r.tipo === 'Fuera del Gym') s.calorias += Number(r.calorias) || 0;
  });
  const lista = Object.values(stats).map(({ fechas, ...s }) => ({
    ...s,
    puntosExtra: diaBonus && s.dias >= diaBonus ? 1 : 0,
  }));
  lista.sort((a, b) => b.dias - a.dias || b.puntosExtra - a.puntosExtra || b.calorias - a.calorias);
  return lista;
}

export async function obtenerRankingSemanal(reto, offsetSemanas = 0) {
  const fechaRef = sumarDias(lunesDe(hoyMX()), offsetSemanas * 7);
  const dias = diasDeSemana(fechaRef);
  const q = query(col(reto.id, 'registros'), where('fecha', '>=', dias[0]), where('fecha', '<=', dias[6]));
  const snap = await getDocs(q);
  return agregarRanking(snap.docs, reto.metaDiasSemana, reto.diaBonus);
}

export async function obtenerRankingMensual(reto) {
  const q = query(col(reto.id, 'registros'), where('mes', '==', mesMX()));
  const snap = await getDocs(q);
  return agregarRanking(snap.docs, reto.metaDiasSemana, null);
}

/** Actividad reciente para el ticker */
export async function obtenerActividadReciente(retoId, max = 8) {
  const q = query(col(retoId, 'registros'), orderBy('creadoEn', 'desc'), limit(20));
  const snap = await getDocs(q);
  const ahora = Date.now();
  return snap.docs
    .map((d) => d.data())
    .filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO')
    .slice(0, max)
    .map((r) => {
      const t = r.creadoEn?.toDate ? r.creadoEn.toDate().getTime() : ahora;
      const mins = Math.max(1, Math.round((ahora - t) / 60000));
      const hace = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
      return { nombre: r.nombre.split(' ')[0], tipo: r.tipo, calorias: Number(r.calorias) || 0, hace };
    });
}

// ——————————————————————————————— PAGOS / BOTE

export async function obtenerBote(retoId) {
  const snap = await getDocs(col(retoId, 'pagos'));
  return snap.docs.reduce((total, d) => total + (parseFloat(d.data().monto) || 0), 0);
}
