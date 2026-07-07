/**
 * Puente hacia Google Sheets: cada registro guardado en Firestore se replica
 * a la hoja original vía un único Web App de Apps Script
 * (apps-script/SheetsBridge.gs) que enruta al Sheet correcto según el reto.
 *
 * El envío es "fire and forget" con una cola de reintentos en localStorage:
 * si el usuario está sin señal, el registro queda en Firestore (fuente de
 * verdad) y la fila se reenvía a la hoja en la siguiente apertura de la app.
 */

const QUEUE_KEY = 'rgf_sheets_queue_v1';

// URL del Web App de Apps Script (SheetsBridge.gs) y token compartido.
// Proyecto personal: van integrados en el código; .env los sobreescribe.
const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL
  || 'https://script.google.com/macros/s/AKfycbx32gTmqgy7vK2wHG2qGZQrRGucRJAW6LD59nh9lE1fND1GiXypf5tG9IVaINOucJ7loA/exec';
const TOKEN = import.meta.env.VITE_SHEETS_WEBHOOK_TOKEN || '7ddf4b0e8c45ea15ca556a993ccd1074';

function leerCola() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}

function guardarCola(cola) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola.slice(-50)));
}

async function enviar(payload) {
  // Apps Script no devuelve CORS headers utilizables → modo no-cors.
  // No podemos leer la respuesta; si el fetch no lanza, lo damos por entregado.
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: TOKEN, ...payload }),
  });
}

/** Replica un registro a la hoja del reto. No lanza: encola si falla. */
export async function sincronizarRegistro(reto, registro) {
  if (!WEBHOOK_URL) return; // sin webhook configurado, la hoja no se alimenta
  const payload = { accion: 'registro', retoId: reto.id, registro };
  try {
    await enviar(payload);
  } catch {
    guardarCola([...leerCola(), payload]);
  }
}

/**
 * Crea o ACTUALIZA la fila del registro en la hoja (ediciones del admin).
 * A diferencia de `sincronizarRegistro`, si la fila ya existe la sobreescribe
 * en lugar de ignorarla como duplicado.
 */
export async function sincronizarRegistroAdmin(reto, registro) {
  if (!WEBHOOK_URL) return;
  const payload = { accion: 'registro-upsert', retoId: reto.id, registro };
  try {
    await enviar(payload);
  } catch {
    guardarCola([...leerCola(), payload]);
  }
}

/** Elimina la fila del registro en la hoja (borrados del admin). */
export async function borrarRegistroSheet(reto, registro) {
  if (!WEBHOOK_URL) return;
  const payload = {
    accion: 'registro-borrar',
    retoId: reto.id,
    registro: { nombre: registro.nombre, fecha: registro.fecha },
  };
  try {
    await enviar(payload);
  } catch {
    guardarCola([...leerCola(), payload]);
  }
}

/**
 * Lee los participantes de la pestaña "Usuarios" del Sheet del reto.
 * La hoja es la fuente viva: das de alta/baja gente editándola.
 */
export async function obtenerUsuariosSheet(retoId) {
  if (!WEBHOOK_URL) throw new Error('Sin webhook configurado');
  const res = await fetch(`${WEBHOOK_URL}?accion=usuarios&token=${TOKEN}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Error al leer la hoja');
  return data.usuarios[retoId] || [];
}

/** Slug estable de un nombre → id de documento ('Alexa Bautista' → 'alexa-bautista') */
export function slugNombre(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reintenta lo pendiente (llamar al arrancar la app) */
export async function drenarCola() {
  if (!WEBHOOK_URL) return;
  const cola = leerCola();
  if (!cola.length) return;
  const restante = [];
  for (const payload of cola) {
    try { await enviar(payload); }
    catch { restante.push(payload); }
  }
  guardarCola(restante);
}
