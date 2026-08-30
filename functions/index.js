/**
 * ogpost — vista previa de publicaciones compartidas.
 *
 * Los bots de WhatsApp/Facebook/Twitter no ejecutan JavaScript ni ven el
 * fragmento #/... de la SPA, así que cada publicación se comparte con la
 * URL limpia  /p/{retoId}/{postId}  (rewrite de Hosting → esta función):
 *   - El bot recibe HTML con Open Graph: título con el autor, el texto o la
 *     actividad como descripción y la foto como miniatura.
 *   - Una persona es redirigida al instante a la pantalla de la publicación
 *     en la app (#/post/{retoId}/{postId}).
 */
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const ORIGEN = 'https://retogymfit.web.app';
const IMAGEN_DEFAULT = `${ORIGEN}/icons/icon-512.png`;
const NOMBRES_RETO = { mixto: 'RETO 2026', damas: 'RETO DAMAS 2026' };

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function descripcionDe(post) {
  if (post.texto) return post.texto.slice(0, 160);
  if (post.tipoPost === 'registro' && post.actividad) {
    const a = post.actividad;
    const partes = [a.tipo];
    if (Number(a.minutos) > 0) partes.push(`${a.minutos} min`);
    if (Number(a.calorias) > 0) partes.push(`${a.calorias} kcal`);
    if (Number(a.racha) > 1) partes.push(`racha de ${a.racha} días 🔥`);
    return `Registró su actividad: ${partes.join(' · ')}`;
  }
  if (post.fotoURL) return '📸 Compartió una foto con el equipo — ábrela para verla.';
  return 'Una publicación del equipo del reto.';
}

exports.ogpost = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 3 }, async (req, res) => {
  const partes = req.path.split('/').filter(Boolean); // ['p', retoId, postId]
  const retoId = esc(partes[1] || '');
  const postId = esc(partes[2] || '');
  const destino = `${ORIGEN}/#/post/${retoId}/${postId}`;

  let post = null;
  try {
    if (retoId && postId && NOMBRES_RETO[retoId]) {
      const snap = await getFirestore().doc(`retos/${retoId}/posts/${postId}`).get();
      if (snap.exists) post = snap.data();
    }
  } catch { /* sin post: se sirve la vista previa genérica */ }

  const reto = NOMBRES_RETO[retoId] || 'RetoGymFit';
  const titulo = post ? `${post.nombre} — ${reto}` : `${reto} — Más fuerte que ayer`;
  const descripcion = post
    ? descripcionDe(post)
    : 'Registra tus entrenamientos, defiende tu racha y compite por el bote con tu equipo.';
  const imagen = post?.fotoURL || IMAGEN_DEFAULT;
  const tarjeta = post?.fotoURL ? 'summary_large_image' : 'summary';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta property="og:site_name" content="RetoGymFit">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(imagen)}">
<meta property="og:url" content="${ORIGEN}/p/${retoId}/${postId}">
<meta name="twitter:card" content="${tarjeta}">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(imagen)}">
<meta name="theme-color" content="#0a0a0a">
<meta http-equiv="refresh" content="0;url=${destino}">
<link rel="canonical" href="${destino}">
<script>location.replace(${JSON.stringify(destino)});</script>
<style>body{background:#0a0a0a;color:#eee;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0}a{color:#d4ff00}</style>
</head>
<body><p>Abriendo la publicación… <a href="${destino}">continuar</a></p></body>
</html>`;

  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(post ? 200 : 404).send(html);
});

// ————————————————————————————————————————————————————————————————
/**
 * Reclama un perfil (primera contraseña, o tras un reinicio de acceso del
 * admin). Las reglas de Firestore no permiten el reclamo directo: pasa por
 * aquí, donde se valida que el perfil esté libre (o ya sea tuyo) y que el
 * email de la cuenta recién creada sea el sintético de ESTE perfil.
 */
exports.reclamarPerfil = onCall({ region: 'us-central1', maxInstances: 3 }, async (req) => {
  if (!req.auth?.token?.email) throw new HttpsError('unauthenticated', 'Necesitas una cuenta con contraseña.');
  const retoId = String(req.data?.retoId || '');
  const usuarioId = String(req.data?.usuarioId || '');
  const nombre = String(req.data?.nombre || '').slice(0, 80);
  if (!retoId || !usuarioId || usuarioId.length > 80) throw new HttpsError('invalid-argument', 'Datos incompletos.');

  const db = getFirestore();
  const ref = db.doc(`retos/${retoId}/usuarios/${usuarioId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const datos = snap.exists ? snap.data() : null;
    if (datos?.authUid && datos.authUid !== req.auth.uid) {
      throw new HttpsError('already-exists', 'Este perfil ya tiene cuenta en otro dispositivo.');
    }
    if (datos?.estado && datos.estado !== 'Activo') {
      throw new HttpsError('permission-denied', 'Este perfil no está activo en el reto.');
    }
    // La cuenta debe ser el email sintético de ESTE perfil (y su generación)
    const gen = Number(datos?.resetGen || 0);
    const emailEsperado = `u-${usuarioId}${gen > 0 ? `-r${gen}` : ''}@${retoId}.retogymfit.app`;
    if (String(req.auth.token.email).toLowerCase() !== emailEsperado) {
      throw new HttpsError('permission-denied', 'La cuenta no corresponde a este perfil.');
    }
    if (snap.exists) {
      tx.update(ref, { authUid: req.auth.uid, hasPassword: true, ultimoAcceso: FieldValue.serverTimestamp() });
    } else {
      // Participante del roster (Google Sheet) sin documento aún: se crea aquí
      tx.set(ref, {
        nombre: nombre || usuarioId,
        estado: 'Activo',
        authUid: req.auth.uid,
        hasPassword: true,
        creadoEn: FieldValue.serverTimestamp(),
        ultimoAcceso: FieldValue.serverTimestamp(),
      });
    }
  });
  return { ok: true };
});
