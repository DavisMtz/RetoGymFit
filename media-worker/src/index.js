/**
 * retogymfit-media — firma subidas y hace borrados en Cloudinary sin que el
 * secreto de la API toque nunca el navegador.
 *
 * Por qué existe: Cloudinary permite subir directo desde el cliente, pero
 * eso EXIGE una firma (HMAC-SHA1 con el api_secret) o el preset queda
 * "sin firmar" — cualquiera con el nombre del preset podría subir/borrar lo
 * que quisiera. Este Worker calcula esa firma sabiendo primero QUIÉN eres
 * (verifica tu ID token de Firebase Auth contra Identity Toolkit, igual que
 * hace Firestore) y construye la ruta del archivo (avatars/{uid},
 * feed/{uid}/{ts}) a partir de TU uid verificado, nunca de lo que mande el
 * cliente — así nadie puede subir/borrar la foto de otro.
 *
 * Endpoints (todos POST, Authorization: Bearer <idToken de Firebase Auth>):
 *   /firmar/avatar  → { cloudName, apiKey, timestamp, signature, publicId, overwrite:true }
 *   /firmar/feed    → idem, publicId único por foto (no overwrite)
 *   /borrar/avatar  → el propio Worker llama a Cloudinary destroy() y responde { ok }
 *
 * El cliente usa la firma para subir DIRECTO a Cloudinary (el archivo nunca
 * pasa por este Worker) — ver src/lib/avatar.js y src/lib/feedFoto.js.
 */

const FORMATOS_PERMITIDOS = 'jpg,jpeg,png,webp';

function conCORS(origen, extra) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sha1Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function firmarCloudinary(params, secret) {
  const ordenado = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return sha1Hex(ordenado + secret);
}

/** Verifica el ID token contra Firebase Auth. null si es inválido o anónimo. */
async function usuarioDesdeToken(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!idToken) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const user = data.users?.[0];
  // Sin email = cuenta anónima (aún no reclamó perfil): no puede subir/borrar fotos.
  if (!user?.email) return null;
  return { uid: user.localId, email: user.email };
}

async function firmarSubida(env, publicId, overwrite) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    allowed_formats: FORMATOS_PERMITIDOS,
    overwrite: String(overwrite),
    public_id: publicId,
    timestamp: String(timestamp),
  };
  const signature = await firmarCloudinary(params, env.CLOUDINARY_API_SECRET);
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    publicId,
    overwrite,
    allowedFormats: FORMATOS_PERMITIDOS,
  };
}

async function borrarEnCloudinary(env, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp: String(timestamp) };
  const signature = await firmarCloudinary(params, env.CLOUDINARY_API_SECRET);
  const body = new URLSearchParams({ ...params, api_key: env.CLOUDINARY_API_KEY, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  return res.ok && (data.result === 'ok' || data.result === 'not found');
}

export default {
  async fetch(request, env) {
    const origen = env.APP_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { headers: conCORS(origen) });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: conCORS(origen) });
    }

    const url = new URL(request.url);
    const usuario = await usuarioDesdeToken(env, request);
    if (!usuario) {
      return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: conCORS(origen) });
    }

    if (url.pathname === '/firmar/avatar') {
      const datos = await firmarSubida(env, `avatars/${usuario.uid}`, true);
      return new Response(JSON.stringify(datos), { headers: conCORS(origen) });
    }

    if (url.pathname === '/firmar/feed') {
      const datos = await firmarSubida(env, `feed/${usuario.uid}/${Date.now()}`, false);
      return new Response(JSON.stringify(datos), { headers: conCORS(origen) });
    }

    if (url.pathname === '/borrar/avatar') {
      const ok = await borrarEnCloudinary(env, `avatars/${usuario.uid}`);
      return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 502, headers: conCORS(origen) });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: conCORS(origen) });
  },
};
