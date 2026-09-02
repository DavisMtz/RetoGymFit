/**
 * retogymfit-auth — recuperación de contraseña por código al correo.
 *
 * Por qué existe: los participantes NO tienen correo en Firebase Auth. Cada
 * uno se mapea a un email sintético `u-{usuarioId}[-r{gen}]@{retoId}.
 * retogymfit.app` que no existe como buzón, así que el correo de
 * restablecimiento de Firebase no tiene a dónde llegar. Quien quiera
 * recuperar su acceso registra antes su correo real desde Perfil.
 *
 * Dónde vive cada cosa (el proyecto se está moviendo a Cloudflare):
 *   · Correos registrados → D1 (`retogymfit.correos`). Fuera de Firestore a
 *     propósito: allí usuarios/{id} lo lee cualquier cuenta autenticada,
 *     incluso anónima, y el correo quedaría a la vista de todo el reto.
 *   · Códigos de un solo uso → KV, solo el hash y con TTL nativo.
 *   · Padrón (quién participa, si está Activo) y contraseñas → todavía en
 *     Firebase; por eso el paso final sigue tocando Firestore.
 *
 * Flujo:
 *   1. POST /recuperar/solicitar  { retoId, usuarioId }
 *      → si hay correo: genera un código de 6 dígitos, guarda su HASH en KV
 *        con TTL de 5 min y lo envía por Brevo. Responde el correo enmascarado.
 *      → si no hay correo: lo dice, para que la app mande a pedirle el
 *        restablecimiento al administrador.
 *   2. POST /recuperar/verificar  { retoId, usuarioId, codigo }
 *      → compara el hash y, si cuadra, LIBERA el perfil igual que hace el
 *        admin: authUid=null, hasPassword=false, resetGen+1. El participante
 *        crea contraseña nueva por el flujo de onboarding que ya existe.
 *
 * No cambiamos la contraseña nosotros: al subir resetGen, la app le genera
 * un email sintético nuevo (`-r{gen}`) y crea una cuenta fresca. Por eso este
 * Worker no necesita Admin SDK ni cuenta de servicio — solo una identidad
 * propia (auth-worker@retogymfit.app) con permiso acotado en firestore.rules.
 *
 * El código NUNCA se guarda en claro: en KV vive sha256(retoId:usuarioId:codigo).
 */
import { html, textoPlano } from './correo.js';

const VIGENCIA_SEG = 300;        // 5 minutos
const REENVIO_SEG = 60;          // no mandar otro código antes de 1 min
const MAX_INTENTOS = 5;          // intentos de verificación por código
const NOMBRES_RETO = { mixto: 'RETO 2026', damas: 'RETO DAMAS 2026' };

/* ── utilidades ─────────────────────────────────────────────────────── */

function cors(origen) {
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  };
}

const json = (datos, origen, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: cors(origen) });

async function sha256(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Código de 6 dígitos con aleatoriedad criptográfica (no Math.random). */
function generarCodigo() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

/** ju***@gmail.com — para que sepa a qué bandeja ir sin exponer el correo. */
function enmascarar(email) {
  const [usuario, dominio] = String(email).split('@');
  if (!dominio) return '···';
  const visible = usuario.slice(0, Math.min(2, usuario.length));
  return `${visible}${'*'.repeat(Math.max(3, usuario.length - visible.length))}@${dominio}`;
}

/** Comparación en tiempo constante: no filtra por dónde difieren los hashes. */
function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i += 1) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

const esRetoValido = (r) => Object.prototype.hasOwnProperty.call(NOMBRES_RETO, r);
// El id de un participante SIEMPRE es un slug: lo generan slugNombre() en
// src/lib/sheets.js y slug_() en apps-script/SheetsBridge.gs, ambos idénticos
// (minúsculas, sin acentos, no-alfanumérico → guion). Nada más es válido.
const esUsuarioValido = (u) => typeof u === 'string' && /^[a-z0-9-]{1,80}$/.test(u);

/* ── Identidad del participante (para registrar su propio correo) ───── */

/**
 * Verifica el ID token de Firebase Auth y devuelve { uid, email }.
 * Mismo patrón que media-worker: no hace falta Admin SDK, basta con
 * preguntarle a Identity Toolkit con la API key pública.
 */
async function usuarioDesdeToken(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!idToken) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const user = (await res.json()).users?.[0];
  if (!user?.email) return null; // cuenta anónima: aún no reclamó perfil
  return { uid: user.localId, email: String(user.email).toLowerCase() };
}

// Mismo slug que emailSintetico() en src/context/AuthContext.jsx.
const slugNombre = (usuarioId) => usuarioId.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

/**
 * ¿El token corresponde al perfil {retoId, usuarioId}? Lo demuestra el propio
 * email sintético de la cuenta, sin necesidad de leer Firestore. No fijamos
 * el número de reinicio (-rN): cualquiera de las generaciones es su dueño.
 */
function esDuenoDelPerfil(emailToken, retoId, usuarioId) {
  const patron = new RegExp(
    `^u-${slugNombre(usuarioId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-r\\d+)?@${retoId}\\.retogymfit\\.app$`,
  );
  return patron.test(emailToken);
}

/* ── Correos registrados (D1) ───────────────────────────────────────── */

async function leerCorreo(env, retoId, usuarioId) {
  const fila = await env.DB
    .prepare('SELECT email FROM correos WHERE reto_id = ? AND usuario_id = ?')
    .bind(retoId, usuarioId)
    .first();
  return fila?.email || null;
}

async function escribirCorreo(env, retoId, usuarioId, email, authUid) {
  await env.DB
    .prepare(`INSERT INTO correos (reto_id, usuario_id, email, auth_uid, actualizado_en)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(reto_id, usuario_id)
              DO UPDATE SET email = excluded.email,
                            auth_uid = excluded.auth_uid,
                            actualizado_en = excluded.actualizado_en`)
    .bind(retoId, usuarioId, email, authUid, Date.now())
    .run();
}

async function quitarCorreo(env, retoId, usuarioId) {
  await env.DB
    .prepare('DELETE FROM correos WHERE reto_id = ? AND usuario_id = ?')
    .bind(retoId, usuarioId)
    .run();
}

/* ── Firestore por REST, con la identidad propia del Worker ─────────── */

async function idTokenWorker(env) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${env.WORKER_REFRESH_TOKEN}`,
  });
  if (!res.ok) throw new Error(`refresh token: ${res.status}`);
  return (await res.json()).id_token;
}

const docUrl = (env, ruta) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}`
  + `/databases/(default)/documents/${ruta}`;

async function leerDoc(env, idToken, ruta) {
  const res = await fetch(docUrl(env, ruta), { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return null; // 404 (no existe) o 403 (reglas)
  const doc = await res.json();
  const salida = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    salida[k] = v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : null);
  }
  return salida;
}

/**
 * Libera el perfil igual que adminRestablecerAcceso() en el cliente.
 * Usa :commit con un transform para que resetGen se incremente de forma
 * atómica en el servidor (leer-y-escribir podría perder un reinicio).
 */
async function liberarPerfil(env, idToken, retoId, usuarioId) {
  const nombreDoc = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`
    + `/retos/${retoId}/usuarios/${encodeURIComponent(usuarioId)}`;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [{
          update: {
            name: nombreDoc,
            fields: { authUid: { nullValue: null }, hasPassword: { booleanValue: false } },
          },
          updateMask: { fieldPaths: ['authUid', 'hasPassword'] },
          updateTransforms: [{ fieldPath: 'resetGen', increment: { integerValue: '1' } }],
          currentDocument: { exists: true },
        }],
      }),
    },
  );
  return res.ok;
}

/* ── Brevo ──────────────────────────────────────────────────────────── */

async function enviarCorreo(env, { para, nombre, codigo, retoId }) {
  const reto = NOMBRES_RETO[retoId];
  const minutos = Math.round(VIGENCIA_SEG / 60);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'RetoGymFit', email: env.BREVO_SENDER },
      to: [{ email: para, name: nombre }],
      subject: `${codigo} es tu código para recuperar tu contraseña`,
      htmlContent: html({ nombre, codigo, reto, minutos }),
      textContent: textoPlano({ nombre, codigo, minutos }),
    }),
  });
  return res.ok;
}

/* ── endpoints ──────────────────────────────────────────────────────── */

async function solicitar(env, cuerpo, origen) {
  const { retoId, usuarioId } = cuerpo;
  if (!esRetoValido(retoId) || !esUsuarioValido(usuarioId)) {
    return json({ error: 'datos_invalidos' }, origen, 400);
  }

  const claveKV = `rec:${retoId}:${usuarioId}`;
  const previo = await env.CODIGOS.get(claveKV, { type: 'json' });
  if (previo && Date.now() - previo.creadoEn < REENVIO_SEG * 1000) {
    const espera = Math.ceil((REENVIO_SEG * 1000 - (Date.now() - previo.creadoEn)) / 1000);
    return json({ error: 'espera', segundos: espera }, origen, 429);
  }

  const idToken = await idTokenWorker(env);
  const perfil = await leerDoc(env, idToken, `retos/${retoId}/usuarios/${encodeURIComponent(usuarioId)}`);
  if (!perfil || perfil.estado !== 'Activo') return json({ error: 'no_encontrado' }, origen, 404);

  const email = await leerCorreo(env, retoId, usuarioId);
  // Sin correo registrado no hay nada que enviar: la app manda a pedirle el
  // restablecimiento al administrador.
  if (!email) return json({ ok: true, tieneCorreo: false }, origen);

  const codigo = generarCodigo();
  await env.CODIGOS.put(
    claveKV,
    JSON.stringify({
      hash: await sha256(`${retoId}:${usuarioId}:${codigo}`),
      intentos: 0,
      creadoEn: Date.now(),
    }),
    { expirationTtl: VIGENCIA_SEG },
  );

  const enviado = await enviarCorreo(env, {
    para: email,
    nombre: perfil.nombre || usuarioId,
    codigo,
    retoId,
  });
  if (!enviado) {
    await env.CODIGOS.delete(claveKV);
    return json({ error: 'envio_fallido' }, origen, 502);
  }

  return json({
    ok: true,
    tieneCorreo: true,
    correo: enmascarar(email),
    expiraEn: VIGENCIA_SEG,
  }, origen);
}

async function verificar(env, cuerpo, origen) {
  const { retoId, usuarioId, codigo } = cuerpo;
  if (!esRetoValido(retoId) || !esUsuarioValido(usuarioId) || !/^\d{6}$/.test(String(codigo || ''))) {
    return json({ error: 'datos_invalidos' }, origen, 400);
  }

  const claveKV = `rec:${retoId}:${usuarioId}`;
  const guardado = await env.CODIGOS.get(claveKV, { type: 'json' });
  // Caducado o inexistente: KV ya lo borró solo al pasar el TTL.
  if (!guardado) return json({ error: 'expirado' }, origen, 410);

  if (guardado.intentos >= MAX_INTENTOS) {
    await env.CODIGOS.delete(claveKV);
    return json({ error: 'demasiados_intentos' }, origen, 429);
  }

  const hash = await sha256(`${retoId}:${usuarioId}:${codigo}`);
  if (!igualSeguro(hash, guardado.hash)) {
    // Conserva el TTL restante para que fallar no alargue la vida del código.
    const restante = Math.max(1, VIGENCIA_SEG - Math.floor((Date.now() - guardado.creadoEn) / 1000));
    await env.CODIGOS.put(
      claveKV,
      JSON.stringify({ ...guardado, intentos: guardado.intentos + 1 }),
      { expirationTtl: restante },
    );
    return json({ error: 'codigo_incorrecto', restantes: MAX_INTENTOS - guardado.intentos - 1 }, origen, 400);
  }

  const idToken = await idTokenWorker(env);
  const liberado = await liberarPerfil(env, idToken, retoId, usuarioId);
  if (!liberado) return json({ error: 'no_se_pudo_liberar' }, origen, 502);

  // Un código válido se quema al usarse.
  await env.CODIGOS.delete(claveKV);
  return json({ ok: true }, origen);
}

/**
 * Registrar / consultar / quitar el correo del propio participante.
 * Requiere su ID token de Firebase Auth: el email sintético de la cuenta
 * demuestra de qué perfil es dueño, así nadie registra correo en cuenta ajena.
 */
async function correo(env, request, cuerpo, origen, accion) {
  const { retoId, usuarioId } = cuerpo;
  if (!esRetoValido(retoId) || !esUsuarioValido(usuarioId)) {
    return json({ error: 'datos_invalidos' }, origen, 400);
  }

  const usuario = await usuarioDesdeToken(env, request);
  if (!usuario) return json({ error: 'unauthenticated' }, origen, 401);
  if (!esDuenoDelPerfil(usuario.email, retoId, usuarioId)) {
    return json({ error: 'no_es_tu_perfil' }, origen, 403);
  }

  if (accion === 'leer') {
    return json({ ok: true, correo: await leerCorreo(env, retoId, usuarioId) }, origen);
  }

  if (accion === 'borrar') {
    await quitarCorreo(env, retoId, usuarioId);
    return json({ ok: true }, origen);
  }

  const email = String(cuerpo.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return json({ error: 'correo_invalido' }, origen, 400);
  }
  await escribirCorreo(env, retoId, usuarioId, email, usuario.uid);
  return json({ ok: true, correo: email }, origen);
}

/* ── entrada ────────────────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const origen = env.APP_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origen) });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, origen, 405);

    let cuerpo;
    try { cuerpo = await request.json(); } catch { return json({ error: 'json_invalido' }, origen, 400); }

    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/correo/guardar') return await correo(env, request, cuerpo, origen, 'guardar');
      if (pathname === '/correo/leer') return await correo(env, request, cuerpo, origen, 'leer');
      if (pathname === '/correo/borrar') return await correo(env, request, cuerpo, origen, 'borrar');
      if (pathname === '/recuperar/solicitar') return await solicitar(env, cuerpo, origen);
      if (pathname === '/recuperar/verificar') return await verificar(env, cuerpo, origen);
    } catch (err) {
      // No filtramos el detalle al cliente; queda en los logs del Worker.
      console.error(pathname, err?.message);
      return json({ error: 'error_interno' }, origen, 500);
    }
    return json({ error: 'not_found' }, origen, 404);
  },
};
