/**
 * Utilidades de imagen para la foto de perfil.
 *
 * La foto se guarda como data URL (JPEG comprimido) dentro del documento del
 * participante en Firestore — sin Firebase Storage, para mantener la app
 * offline-first y sin depender del plan Blaze. Por eso comprimimos fuerte en
 * el cliente: recorte cuadrado centrado + escala a ≤ LADO_MAX px, y bajamos la
 * calidad hasta que el data URL quepa holgado bajo el límite de 1 MB por doc.
 */

const LADO_MAX = 320;        // px del lado del avatar cuadrado
const OBJETIVO_BYTES = 120000; // ~120 KB de data URL (muy por debajo del doc)
const CALIDAD_MIN = 0.5;

function leerArchivo(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    fr.readAsDataURL(file);
  });
}

function cargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('La imagen no es válida.'));
    img.src = src;
  });
}

/**
 * Recibe un File de imagen y devuelve un data URL JPEG cuadrado y ligero,
 * listo para guardar en Firestore.
 */
export async function comprimirFoto(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Selecciona una imagen.');
  }
  const dataUrl = await leerArchivo(file);
  const img = await cargarImagen(dataUrl);

  // Recorte cuadrado centrado
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - lado) / 2;
  const sy = (img.naturalHeight - lado) / 2;
  const destino = Math.min(lado, LADO_MAX);

  const canvas = document.createElement('canvas');
  canvas.width = destino;
  canvas.height = destino;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, destino, destino);

  // Bajamos calidad hasta caber bajo el objetivo
  let calidad = 0.85;
  let salida = canvas.toDataURL('image/jpeg', calidad);
  while (salida.length > OBJETIVO_BYTES && calidad > CALIDAD_MIN) {
    calidad -= 0.1;
    salida = canvas.toDataURL('image/jpeg', calidad);
  }
  return salida;
}
