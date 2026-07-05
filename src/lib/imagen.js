/**
 * Utilidades de imagen para la foto de perfil.
 *
 * La foto se sube a Firebase Storage, así que aquí sólo la preparamos:
 * recorte cuadrado centrado + escala a ≤ LADO_MAX px + JPEG, bajando la
 * calidad hasta que el archivo quede ligero (subida rápida y menos consumo).
 * Devolvemos un Blob listo para `uploadBytes`.
 */

const LADO_MAX = 320;          // px del lado del avatar cuadrado
const OBJETIVO_BYTES = 150000; // ~150 KB por foto
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

function canvasABlob(canvas, calidad) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      calidad,
    );
  });
}

/**
 * Recibe un File de imagen y devuelve un Blob JPEG cuadrado y ligero,
 * listo para subir a Firebase Storage.
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
  let blob = await canvasABlob(canvas, calidad);
  while (blob.size > OBJETIVO_BYTES && calidad > CALIDAD_MIN) {
    calidad -= 0.1;
    blob = await canvasABlob(canvas, calidad);
  }
  return blob;
}
