/**
 * Fotos del feed social: se comprimen en el cliente (máx. 1080 px por lado,
 * JPEG progresivamente más ligero) y se suben a Cloudinary en
 * feed/{uid}/{ts} (vía media-worker/). Devuelve la URL pública para
 * guardarla en el documento del post.
 */
import { auth } from '../firebase';
import { subirImagen } from './cloudinary';

const LADO_MAX = 1080;
const OBJETIVO_BYTES = 350000; // ~350 KB por foto
const CALIDAD_MIN = 0.5;

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

function aBlob(canvas, calidad) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', calidad);
  });
}

/** Comprime un File de imagen manteniendo su proporción. Devuelve un Blob JPEG. */
export async function comprimirFotoFeed(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecciona una imagen.');
  const img = await cargarImagen(file);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let calidad = 0.85;
  let blob = await aBlob(canvas, calidad);
  while (blob.size > OBJETIVO_BYTES && calidad > CALIDAD_MIN) {
    calidad -= 0.1;
    blob = await aBlob(canvas, calidad);
  }
  return blob;
}

/** Sube la foto (ya comprimida o File original) y devuelve su URL pública. */
export async function subirFotoFeed(file) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sin sesión');
  const blob = await comprimirFotoFeed(file);
  return subirImagen('/firmar/feed', blob);
}
