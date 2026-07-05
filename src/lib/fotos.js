/**
 * Foto de perfil en Firebase Storage.
 *
 * La foto se guarda en `avatares/{authUid}/perfil.jpg` — la ruta va atada al
 * uid de Firebase Auth, no al usuarioId, para que las reglas de Storage puedan
 * exigir que sólo el dueño (mismo uid) escriba su avatar sin consultar
 * Firestore. La URL de descarga resultante se guarda en el documento del
 * participante (`usuarios/{id}.fotoPerfil`).
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

const rutaFoto = (uid) => `avatares/${uid}/perfil.jpg`;

/** Sube el Blob del avatar y devuelve su URL de descarga pública (con token). */
export async function subirFoto(uid, blob) {
  const r = ref(storage, rutaFoto(uid));
  await uploadBytes(r, blob, {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=3600',
  });
  return getDownloadURL(r);
}

/** Borra el avatar del usuario en Storage (ignora si no existe). */
export async function borrarFoto(uid) {
  try {
    await deleteObject(ref(storage, rutaFoto(uid)));
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err;
  }
}
