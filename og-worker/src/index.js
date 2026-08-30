/**
 * retogymfit-og — vista previa de publicaciones compartidas, en Cloudflare
 * Workers (reemplaza a la Cloud Function `ogpost`, congelada porque el
 * proyecto de Firebase ya no tiene plan Blaze).
 *
 * Los bots de WhatsApp/Facebook/Twitter no ejecutan JavaScript ni ven el
 * fragmento #/... de la SPA, así que cada publicación se comparte con
 * https://og-retogymfit.logidma.com/{retoId}/{postId}:
 *   - El bot recibe HTML con Open Graph: título con el autor, el texto o la
 *     actividad como descripción y la foto como miniatura.
 *   - Una persona es redirigida al instante a la pantalla de la publicación
 *     en la app real (Firebase Hosting): {APP_ORIGIN}/#/post/{retoId}/{postId}.
 *
 * Firestore se lee por su API REST, autenticado como el MISMO tipo de cuenta
 * anónima que ya usa el cliente (Firebase Auth) — nada de llave de servicio
 * ni Admin SDK: respeta las reglas normales de firestore.rules
 * (`allow read: if request.auth != null` en retos/{retoId}/posts/{postId}).
 * El refresh token de esa cuenta anónima vive en el secret
 * FIREBASE_REFRESH_TOKEN (no en este archivo, no en git).
 */

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

// Decodifica el formato { stringValue, mapValue, ... } de la API REST de
// Firestore a un objeto JS plano (lo que el Admin SDK ya daba con .data()).
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null; // nullValue, o campo desconocido
}
function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

async function tokenAnonimo(env) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${env.FIREBASE_REFRESH_TOKEN}`,
  });
  if (!res.ok) throw new Error(`refresh token: ${res.status}`);
  const datos = await res.json();
  return datos.id_token;
}

async function obtenerPost(env, retoId, postId) {
  const idToken = await tokenAnonimo(env);
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}`
    + `/databases/(default)/documents/retos/${retoId}/posts/${postId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return null; // 404 (no existe) o 403 (reglas) → vista genérica
  const doc = await res.json();
  return decodeFields(doc.fields || {});
}

function paginaHtml({ titulo, descripcion, imagen, tarjeta, destino, ogUrl }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta property="og:site_name" content="RetoGymFit">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(imagen)}">
<meta property="og:url" content="${esc(ogUrl)}">
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
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

    const cache = caches.default;
    const cacheado = await cache.match(request);
    if (cacheado) return cacheado;

    const url = new URL(request.url);
    const partes = url.pathname.split('/').filter(Boolean); // [retoId, postId]
    const retoId = esc(partes[0] || '');
    const postId = esc(partes[1] || '');
    const destino = `${env.APP_ORIGIN}/#/post/${retoId}/${postId}`;

    let post = null;
    if (retoId && postId && NOMBRES_RETO[retoId]) {
      try { post = await obtenerPost(env, retoId, postId); } catch { /* vista genérica */ }
    }

    const reto = NOMBRES_RETO[retoId] || 'RetoGymFit';
    const titulo = post ? `${post.nombre} — ${reto}` : `${reto} — Más fuerte que ayer`;
    const descripcion = post
      ? descripcionDe(post)
      : 'Registra tus entrenamientos, defiende tu racha y compite por el bote con tu equipo.';
    const imagen = post?.fotoURL || `${env.APP_ORIGIN}/icons/icon-512.png`;
    const tarjeta = post?.fotoURL ? 'summary_large_image' : 'summary';

    const html = paginaHtml({ titulo, descripcion, imagen, tarjeta, destino, ogUrl: url.toString() });

    const response = new Response(html, {
      status: post ? 200 : 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
