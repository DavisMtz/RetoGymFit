/**
 * Utilidades de fecha ancladas a la zona horaria del reto (America/Mexico_City),
 * igual que hacía el backend de Apps Script.
 */

const ZONA = 'America/Mexico_City';

const fmtYMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Fecha actual en MX como 'yyyy-MM-dd' */
export function hoyMX(date = new Date()) {
  return fmtYMD.format(date);
}

/** Convierte 'yyyy-MM-dd' a Date local a mediodía (evita corrimientos de zona) */
export function aFecha(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function sumarDias(ymd, dias) {
  const f = aFecha(ymd);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

/** Número de semana ISO de una fecha 'yyyy-MM-dd' */
export function semanaISO(ymd) {
  const f = aFecha(ymd);
  const d = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Año ISO (para semanas que cruzan de año) */
export function anioISO(ymd) {
  const f = aFecha(ymd);
  const d = new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

/** Lunes de la semana de una fecha 'yyyy-MM-dd' */
export function lunesDe(ymd) {
  const f = aFecha(ymd);
  const diaNorm = f.getDay() === 0 ? 7 : f.getDay();
  return sumarDias(ymd, -(diaNorm - 1));
}

/** Los 7 días (lun-dom) de la semana de `ymd` como ['yyyy-MM-dd', ...] */
export function diasDeSemana(ymd) {
  const lunes = lunesDe(ymd);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

export const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** 'yyyy-MM' del mes actual MX */
export function mesMX(date = new Date()) {
  return hoyMX(date).slice(0, 7);
}

export function formatoCorto(ymd) {
  const f = aFecha(ymd);
  return f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function formatoLargo(ymd) {
  const f = aFecha(ymd);
  return f.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Días que faltan para una fecha 'yyyy-MM-dd' (desde hoy MX) */
export function diasHasta(ymd) {
  return Math.ceil((aFecha(ymd) - aFecha(hoyMX())) / 86400000);
}

/**
 * Racha de días consecutivos con estatus CUMPLE/JUSTIFICADO.
 * `fechasCumplidas` es un Set/array de 'yyyy-MM-dd'. Regla: la racha vive
 * si el último día registrado es hoy o ayer.
 */
export function calcularRacha(fechasCumplidas) {
  const fechas = [...new Set(fechasCumplidas)].sort().reverse();
  if (!fechas.length) return 0;
  const hoy = hoyMX();
  const ayer = sumarDias(hoy, -1);
  if (fechas[0] !== hoy && fechas[0] !== ayer) return 0;
  let racha = 1;
  for (let i = 0; i < fechas.length - 1; i++) {
    const diff = Math.round((aFecha(fechas[i]) - aFecha(fechas[i + 1])) / 86400000);
    if (diff === 1) racha++;
    else break;
  }
  return racha;
}

/** Mejor racha histórica */
export function mejorRacha(fechasCumplidas) {
  const fechas = [...new Set(fechasCumplidas)].sort();
  if (!fechas.length) return 0;
  let mejor = 1, actual = 1;
  for (let i = 1; i < fechas.length; i++) {
    const diff = Math.round((aFecha(fechas[i]) - aFecha(fechas[i - 1])) / 86400000);
    if (diff === 1) { actual++; mejor = Math.max(mejor, actual); }
    else actual = 1;
  }
  return mejor;
}
