/**
 * Puente hacia Google Sheets: cada registro guardado en Firestore se replica
 * a la hoja original vía el Web App de Apps Script (apps-script/SheetsBridge.gs).
 *
 * El envío es "fire and forget" con una cola de reintentos en localStorage:
 * si el usuario está sin señal, el registro queda en Firestore (fuente de
 * verdad) y la fila se reenvía a la hoja en la siguiente apertura de la app.
 */

const QUEUE_KEY = 'rgf_sheets_queue_v1';
const TOKEN = import.meta.env.VITE_SHEETS_WEBHOOK_TOKEN || '';

function webhookUrl(reto) {
  return import.meta.env[reto.webhookEnv] || '';
}

function leerCola() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; }
}

function guardarCola(cola) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola.slice(-50)));
}

async function enviar(url, payload) {
  // Apps Script no devuelve CORS headers utilizables → modo no-cors.
  // No podemos leer la respuesta; si el fetch no lanza, lo damos por entregado.
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: TOKEN, ...payload }),
  });
}

/** Replica un registro a la hoja del reto. No lanza: encola si falla. */
export async function sincronizarRegistro(reto, registro) {
  const url = webhookUrl(reto);
  if (!url) return; // sin webhook configurado, la hoja no se alimenta
  const payload = { accion: 'registro', retoId: reto.id, registro };
  try {
    await enviar(url, payload);
  } catch {
    guardarCola([...leerCola(), { retoId: reto.id, payload }]);
  }
}

/** Reintenta lo pendiente (llamar al arrancar la app) */
export async function drenarCola(retosById) {
  const cola = leerCola();
  if (!cola.length) return;
  const restante = [];
  for (const item of cola) {
    const reto = retosById[item.retoId];
    const url = reto ? webhookUrl(reto) : '';
    if (!url) continue;
    try { await enviar(url, item.payload); }
    catch { restante.push(item); }
  }
  guardarCola(restante);
}
