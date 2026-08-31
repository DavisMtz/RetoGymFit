/**
 * Fotos de perfil: redimensiona la imagen en el cliente (para que pese poco),
 * la sube a Cloudinary (avatars/{uid}, vía media-worker/) y guarda la URL en
 * el documento del participante (usuarios/{id}.photoURL).
 */
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { subirImagen, borrarImagenAvatar } from './cloudinary';

const MAX_LADO = 320; // px — suficiente para avatares nítidos y ligeros

/** Redimensiona/recorta a cuadrado y comprime a JPEG. Devuelve un Blob. */
function procesarImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.width, img.height);
      const sx = (img.width - lado) / 2;
      const sy = (img.height - lado) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = MAX_LADO;
      canvas.height = MAX_LADO;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, MAX_LADO, MAX_LADO);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')); };
    img.src = url;
  });
}

/** Sube el avatar del participante y devuelve la URL pública. */
export async function subirAvatar(retoId, usuarioId, file) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sin sesión');
  const blob = await procesarImagen(file);
  const url = await subirImagen('/firmar/avatar', blob);
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), { photoURL: url });
  return url;
}

/** Quita el avatar: borra el archivo en Cloudinary y limpia photoURL. */
export async function borrarAvatar(retoId, usuarioId) {
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sin sesión');
  await borrarImagenAvatar();
  await updateDoc(doc(db, 'retos', retoId, 'usuarios', usuarioId), { photoURL: deleteField() });
}
