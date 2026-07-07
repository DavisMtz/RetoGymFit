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
  setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
  onSnapshot, writeBatch, increment, deleteField,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
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

/**
 * Quiénes ya entrenaron hoy (para la barra grupal de la pantalla Hoy).
 * Igual que el ticker: solo CUMPLE/JUSTIFICADO y sin Periodo Menstrual,
 * por privacidad.
 */
export async function obtenerQuienesEntrenaronHoy(retoId) {
  const q = query(col(retoId, 'registros'), where('fecha', '==', hoyMX()));
  const snap = await getDocs(q);
  const vistos = new Set();
  const lista = [];
  snap.docs.forEach((d) => {
    const r = d.data();
    if (r.estatus !== 'CUMPLE' && r.estatus !== 'JUSTIFICADO') return;
    if (r.tipo === 'Periodo Menstrual') return;
    if (vistos.has(r.usuarioId)) return;
    vistos.add(r.usuarioId);
    lista.push({ usuarioId: r.usuarioId, nombre: r.nombre });
  });
  return lista;
}

/** Actividad reciente para el ticker (sin Periodo Menstrual, por privacidad) */
export async function obtenerActividadReciente(retoId, max = 8) {
  const q = query(col(retoId, 'registros'), orderBy('creadoEn', 'desc'), limit(20));
  const snap = await getDocs(q);
  const ahora = Date.now();
  return snap.docs
    .map((d) => d.data())
    .filter((r) => (r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO') && r.tipo !== 'Periodo Menstrual')
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

// ——————————————————————————————— ADMIN
// Estas operaciones solo las autorizan las reglas para el super usuario
// (admin@retogymfit.app); ver firestore.rules → esAdmin().

/** Todos los participantes del reto, incluidos los dados de baja. */
export async function adminObtenerUsuarios(retoId) {
  const snap = await getDocs(col(retoId, 'usuarios'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Actualiza campos arbitrarios de un participante (estado, nombre, etc.). */
export async function adminActualizarUsuario(retoId, usuarioId, campos) {
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), campos);
}

/**
 * Crea o sobrescribe el registro de un participante en cualquier fecha.
 * Deriva semana/mes del `fecha` para mantener el ranking consistente.
 */
export async function adminGuardarRegistro(retoId, usuario, datos) {
  const { fecha } = datos;
  const registro = {
    usuarioId: usuario.id,
    nombre: usuario.nombre,
    fecha,
    semanaIso: semanaISO(fecha),
    anioIso: anioISO(fecha),
    mes: fecha.slice(0, 7),
    tipo: datos.tipo,
    minutos: Number(datos.minutos) || 0,
    calorias: Number(datos.calorias) || 0,
    evidencia: datos.evidencia ?? 'ADMIN',
    estatus: datos.estatus,
    notas: datos.notas || '',
    creadoEn: serverTimestamp(),
    editadoPorAdmin: true,
  };
  await setDoc(doc(db, 'retos', retoId, 'registros', idRegistro(usuario.id, fecha)), registro);
  return registro;
}

export async function adminBorrarRegistro(retoId, registroId) {
  await deleteDoc(doc(db, 'retos', retoId, 'registros', registroId));
}

/** Pagos del bote, más recientes primero. */
export async function adminObtenerPagos(retoId) {
  const snap = await getDocs(col(retoId, 'pagos'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

export async function adminAgregarPago(retoId, pago) {
  const ref = await addDoc(col(retoId, 'pagos'), {
    fecha: pago.fecha,
    usuario: pago.usuario,
    monto: Number(pago.monto) || 0,
    notas: pago.notas || '',
    creadoEn: serverTimestamp(),
  });
  return ref.id;
}

export async function adminBorrarPago(retoId, pagoId) {
  await deleteDoc(doc(db, 'retos', retoId, 'pagos', pagoId));
}

/** Publicaciones del feed (las más recientes primero) para moderación. */
export async function adminObtenerPosts(retoId, max = 100) {
  const q = query(col(retoId, 'posts'), orderBy('creadoEn', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Edita el texto (u otros campos) de cualquier publicación. */
export async function adminActualizarPost(retoId, postId, campos) {
  await updateDoc(doc(db, 'retos', retoId, 'posts', postId), campos);
}

/**
 * Borra una publicación de cualquier participante, incluidos sus comentarios
 * (Firestore no borra subcolecciones en cascada).
 */
export async function adminBorrarPost(retoId, postId) {
  const coms = await getDocs(collection(db, 'retos', retoId, 'posts', postId, 'comentarios'));
  const batch = writeBatch(db);
  coms.docs.forEach((c) => batch.delete(c.ref));
  batch.delete(doc(db, 'retos', retoId, 'posts', postId));
  await batch.commit();
}

// ——————————————————————————————— FEED SOCIAL
// Publicaciones con texto/foto + reacciones (una por persona, llaveada por
// authUid) + comentarios. Las reglas validan autoría; ver firestore.rules.

/** Feed en vivo: llama a cb con los posts (más recientes primero). Devuelve unsubscribe. */
export function suscribirPosts(retoId, cb, onError, max = 30) {
  const q = query(col(retoId, 'posts'), orderBy('creadoEn', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError?.(err),
  );
}

export async function publicarPost(retoId, usuario, { texto, fotoURL }) {
  const post = {
    usuarioId: usuario.id,
    authUid: auth.currentUser.uid,
    nombre: usuario.nombre,
    texto: texto || '',
    fotoURL: fotoURL || null,
    reacciones: {},
    numComentarios: 0,
    creadoEn: serverTimestamp(),
  };
  const ref = await addDoc(col(retoId, 'posts'), post);
  return ref.id;
}

export async function borrarPost(retoId, postId) {
  await deleteDoc(doc(db, 'retos', retoId, 'posts', postId));
}

/**
 * Publica automáticamente la actividad del día en el feed: tarjeta especial
 * con tipo/minutos/kcal/racha y, como texto, la nota que acompañó al registro.
 * No lanza — el autopost es cortesía y nunca debe bloquear el registro.
 */
export async function publicarPostRegistro(retoId, usuario, registro, racha) {
  try {
    await addDoc(col(retoId, 'posts'), {
      usuarioId: usuario.id,
      authUid: auth.currentUser.uid,
      nombre: usuario.nombre,
      texto: (registro.notas || '').slice(0, 500),
      fotoURL: null,
      tipoPost: 'registro',
      actividad: {
        tipo: registro.tipo,
        minutos: Number(registro.minutos) || 0,
        calorias: Number(registro.calorias) || 0,
        estatus: registro.estatus,
        racha: Number(racha) || 0,
      },
      reacciones: {},
      numComentarios: 0,
      creadoEn: serverTimestamp(),
    });
  } catch { /* el registro ya quedó guardado; el feed no es crítico */ }
}

/** High-five 🖐️ a otro participante — le llega como notificación push. */
export async function enviarHighFive(retoId, deUsuario, paraUsuario) {
  if (!paraUsuario?.authUid) throw new Error('Sin cuenta activa');
  if (paraUsuario.authUid === auth.currentUser?.uid) return;
  await addDoc(col(retoId, 'eventos'), {
    tipo: 'highfive',
    deAuthUid: auth.currentUser.uid,
    deNombre: deUsuario?.nombre || 'Alguien',
    paraAuthUid: paraUsuario.authUid,
    detalle: '🖐️',
    postTexto: '',
    creadoEn: serverTimestamp(),
  });
}

/**
 * Notifica a los participantes @mencionados en un comentario (máx. 3).
 * Fire-and-forget: la notificación es cortesía, no bloquea el comentario.
 */
export function notificarMenciones(retoId, post, usuario, texto, mencionados) {
  const miUid = auth.currentUser?.uid;
  (mencionados || []).slice(0, 3).forEach((m) => {
    if (!m.authUid || m.authUid === miUid) return;
    addDoc(col(retoId, 'eventos'), {
      tipo: 'mencion',
      deAuthUid: miUid,
      deNombre: usuario?.nombre || 'Alguien',
      paraAuthUid: m.authUid,
      detalle: String(texto || '').slice(0, 120),
      postTexto: String(post?.texto || '').slice(0, 80),
      creadoEn: serverTimestamp(),
    }).catch(() => { /* no crítico */ });
  });
}

/**
 * Aviso para el emisor de notificaciones (Apps Script): se escribe un evento
 * cuando reaccionas o comentas la publicación de OTRA persona. Fire-and-forget.
 */
function registrarEvento(retoId, post, usuario, tipo, detalle) {
  if (!post?.authUid || post.authUid === auth.currentUser?.uid) return;
  addDoc(col(retoId, 'eventos'), {
    tipo,
    deAuthUid: auth.currentUser.uid,
    deNombre: usuario?.nombre || 'Alguien',
    paraAuthUid: post.authUid,
    detalle: String(detalle || '').slice(0, 120),
    postTexto: String(post.texto || '').slice(0, 80),
    creadoEn: serverTimestamp(),
  }).catch(() => { /* la notificación es cortesía; no bloquea la acción */ });
}

/** Reacciona con un emoji, o pasa null para quitar tu reacción. */
export async function reaccionarPost(retoId, post, usuario, emoji) {
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, 'retos', retoId, 'posts', post.id), {
    [`reacciones.${uid}`]: emoji == null ? deleteField() : emoji,
  });
  if (emoji != null) registrarEvento(retoId, post, usuario, 'reaccion', emoji);
}

export async function obtenerComentarios(retoId, postId) {
  const q = query(
    collection(db, 'retos', retoId, 'posts', postId, 'comentarios'),
    orderBy('creadoEn', 'asc'),
    limit(100),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Comenta y sube el contador del post en una sola operación atómica. */
export async function comentarPost(retoId, post, usuario, texto) {
  const batch = writeBatch(db);
  const comentarioRef = doc(collection(db, 'retos', retoId, 'posts', post.id, 'comentarios'));
  batch.set(comentarioRef, {
    usuarioId: usuario.id,
    authUid: auth.currentUser.uid,
    nombre: usuario.nombre,
    texto,
    creadoEn: serverTimestamp(),
  });
  batch.update(doc(db, 'retos', retoId, 'posts', post.id), { numComentarios: increment(1) });
  await batch.commit();
  registrarEvento(retoId, post, usuario, 'comentario', texto);
  return comentarioRef.id;
}

export async function borrarComentario(retoId, postId, comentarioId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'retos', retoId, 'posts', postId, 'comentarios', comentarioId));
  batch.update(doc(db, 'retos', retoId, 'posts', postId), { numComentarios: increment(-1) });
  await batch.commit();
}
