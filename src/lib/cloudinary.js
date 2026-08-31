/**
 * Subida de imágenes a Cloudinary vía el Worker de Cloudflare (media-worker/)
 * que firma cada operación — el secreto de Cloudinary nunca toca el
 * navegador. El archivo se sube DIRECTO del cliente a Cloudinary (el Worker
 * solo firma, no reenvía bytes).
 */
import { auth } from '../firebase';

const MEDIA_WORKER = 'https://media-retogymfit.logidma.com';

async function pedirFirma(ruta) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${MEDIA_WORKER}${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error('No se pudo autorizar la subida.');
  return res.json();
}

/** Sube un Blob a Cloudinary con una firma ya obtenida del Worker. */
async function subirConFirma(blob, firma) {
  const body = new FormData();
  body.append('file', blob);
  body.append('api_key', firma.apiKey);
  body.append('timestamp', firma.timestamp);
  body.append('signature', firma.signature);
  body.append('public_id', firma.publicId);
  body.append('overwrite', String(firma.overwrite));
  body.append('allowed_formats', firma.allowedFormats);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'No se pudo subir la imagen.');
  return data.secure_url;
}

/** Pide firma para `ruta` ('/firmar/avatar' o '/firmar/feed') y sube el blob. Devuelve la URL pública. */
export async function subirImagen(ruta, blob) {
  const firma = await pedirFirma(ruta);
  return subirConFirma(blob, firma);
}

/** Borra el avatar del usuario actual en Cloudinary (vía el Worker, con su propia autorización). */
export async function borrarImagenAvatar() {
  const idToken = await auth.currentUser.getIdToken();
  await fetch(`${MEDIA_WORKER}/borrar/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
}
