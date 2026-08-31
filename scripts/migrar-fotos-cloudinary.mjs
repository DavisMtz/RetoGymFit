/**
 * Migración de fotos (avatares + feed) de Firebase Storage → Cloudinary.
 *
 * Recorre usuarios.photoURL y posts.fotoURL de los dos retos; para cada URL
 * que sigue apuntando a Firebase Storage, le pide a Cloudinary que la traiga
 * ella misma (upload por URL remota, sin bajar/subir bytes desde aquí) y
 * reescribe el campo en Firestore con la URL nueva de Cloudinary.
 *
 * Usa las credenciales de `admin-sync@retogymfit.app` (las mismas que
 * apps-script/SheetsBridge.gs) por REST — el ÚNICO uid con permiso de
 * escritura total en las reglas de Firestore.
 *
 * Uso:
 *   node scripts/migrar-fotos-cloudinary.mjs --dry-run   (solo cuenta, no toca nada)
 *   node scripts/migrar-fotos-cloudinary.mjs             (migra de verdad)
 *
 * Credenciales de Cloudinary por variables de entorno (nunca en el código):
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 */
import { createHash } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');

const FB_PROJECT = 'retogymfit';
const FB_API_KEY = 'AIzaSyDQwFU9hcM1iJbRJW5zArdhvlV-vqaRIQE';
const FB_ADMIN_EMAIL = 'admin-sync@retogymfit.app';
const FB_ADMIN_PASSWORD = process.env.FB_ADMIN_PASSWORD;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

for (const [nombre, valor] of Object.entries({ FB_ADMIN_PASSWORD, CLOUD_NAME, API_KEY, API_SECRET })) {
  if (!valor) { console.error(`Falta la variable de entorno ${nombre}`); process.exit(1); }
}

const RETOS = ['mixto', 'damas'];
const ES_STORAGE = /firebasestorage\.(googleapis\.com|app)/;

async function tokenAdmin() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FB_ADMIN_EMAIL, password: FB_ADMIN_PASSWORD, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!data.idToken) throw new Error(`Login admin falló: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function listarDocs(token, path) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/${path}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`Firestore list ${path}: ${JSON.stringify(data)}`);
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return docs;
}

async function actualizarCampo(token, docName, campo, nuevaUrl) {
  const url = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=${campo}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [campo]: { stringValue: nuevaUrl } } }),
  });
  if (!res.ok) throw new Error(`Firestore patch ${docName}: ${res.status} ${await res.text()}`);
}

function firmarCloudinary(params) {
  const ordenado = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(ordenado + API_SECRET).digest('hex');
}

/** Le pide a Cloudinary que traiga `fileUrl` ella misma y la guarde en `publicId`. */
async function subirDesdeUrl(fileUrl, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { overwrite: 'true', public_id: publicId, timestamp: String(timestamp) };
  const signature = firmarCloudinary(params);
  const body = new URLSearchParams({ ...params, file: fileUrl, api_key: API_KEY, signature });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Cloudinary ${publicId}: ${JSON.stringify(data)}`);
  return data.secure_url;
}

async function main() {
  const token = await tokenAdmin();
  let vistos = 0, migrados = 0, fallidos = 0;

  for (const reto of RETOS) {
    // — Avatares (usuarios.photoURL) → avatars/{usuarioId}
    const usuarios = await listarDocs(token, `retos/${reto}/usuarios`);
    for (const u of usuarios) {
      const url = u.fields?.photoURL?.stringValue;
      if (!url || !ES_STORAGE.test(url)) continue;
      vistos++;
      const id = u.name.split('/').pop();
      console.log(`${DRY_RUN ? '[dry-run] ' : ''}avatar ${reto}/${id}`);
      if (DRY_RUN) continue;
      try {
        const nueva = await subirDesdeUrl(url, `avatars/${id}`);
        await actualizarCampo(token, u.name, 'photoURL', nueva);
        migrados++;
      } catch (err) { console.error(`  ✗ ${err.message}`); fallidos++; }
    }

    // — Fotos del feed (posts.fotoURL) → feed/{postId}
    const posts = await listarDocs(token, `retos/${reto}/posts`);
    for (const p of posts) {
      const url = p.fields?.fotoURL?.stringValue;
      if (!url || !ES_STORAGE.test(url)) continue;
      vistos++;
      const id = p.name.split('/').pop();
      console.log(`${DRY_RUN ? '[dry-run] ' : ''}post ${reto}/${id}`);
      if (DRY_RUN) continue;
      try {
        const nueva = await subirDesdeUrl(url, `feed/${id}`);
        await actualizarCampo(token, p.name, 'fotoURL', nueva);
        migrados++;
      } catch (err) { console.error(`  ✗ ${err.message}`); fallidos++; }
    }
  }

  console.log(`\n${DRY_RUN ? 'Encontradas' : 'Vistas'}: ${vistos}${DRY_RUN ? '' : ` · migradas: ${migrados} · fallidas: ${fallidos}`}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
