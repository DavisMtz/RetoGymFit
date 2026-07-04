/**
 * Configuración de cada reto. Todo lo que difiere entre la versión
 * Mixto y la versión Damas vive aquí: metas, actividades, reglas de
 * cumplimiento y límites de días justificados.
 */

export const RETOS = {
  mixto: {
    id: 'mixto',
    nombre: 'RETO 2026',
    subtitulo: 'Mixto',
    marca: 'R',
    genero: 'x', // para textos: bienvenidx
    metaDiasSemana: 4,
    diaBonus: 5, // completar un 5to día = +1 punto
    multaSemanal: 65,
    fechaInicio: '2026-01-12',
    fechaFin: '2026-12-13',
    acento: '#d4ff00',
    acentoSecundario: null,
    webhookEnv: 'VITE_SHEETS_WEBHOOK_MIXTO',
    actividades: [
      { id: 'Gimnasio', nombre: 'Gimnasio', tag: 'Entrenamiento', icono: '🏋️', requiereDatos: true },
      { id: 'Fuera del Gym', nombre: 'Outdoor', tag: 'Fuera del gym', icono: '🏃', requiereDatos: true },
      { id: 'Vacaciones', nombre: 'Vacaciones', tag: 'Descanso', icono: '🌴', requiereDatos: false },
      { id: 'Incapacidad', nombre: 'Incapacidad', tag: 'Salud', icono: '🏥', requiereDatos: false },
    ],
    reglasTexto: {
      Gimnasio: '🎯 Mínimo: <b>1:15 hrs</b> ó <b>500 kcal</b>',
      'Fuera del Gym': '🏃 Mínimo: <b>90 min / 550 kcal</b> ó <b>700 kcal en menos de 2 hrs</b>',
      default: '🌴 Día de descanso o justificante médico — sin requisitos.',
    },
    /** Devuelve CUMPLE / NO CUMPLE / JUSTIFICADO / N/A */
    evaluar(tipo, minutos, kcal) {
      if (tipo === 'Gimnasio') return minutos >= 75 || kcal >= 500 ? 'CUMPLE' : 'NO CUMPLE';
      if (tipo === 'Fuera del Gym')
        return (minutos >= 90 && kcal >= 550) || (kcal >= 700 && minutos <= 120) ? 'CUMPLE' : 'NO CUMPLE';
      if (tipo === 'Vacaciones' || tipo === 'Incapacidad') return 'JUSTIFICADO';
      return 'N/A';
    },
    limites: {
      Vacaciones: { periodo: 'anual', max: 13, mensaje: 'Ya agotaste tus 13 días de vacaciones anuales.' },
    },
  },

  damas: {
    id: 'damas',
    nombre: 'RETO DAMAS 2026',
    subtitulo: 'Damas',
    marca: 'D',
    genero: 'a', // bienvenida
    metaDiasSemana: 3,
    diaBonus: 4, // completar un 4to día = +1 punto
    multaSemanal: 65,
    fechaInicio: '2026-01-12',
    fechaFin: '2026-12-13',
    acento: '#d4ff00',
    acentoSecundario: '#ff8fb1',
    webhookEnv: 'VITE_SHEETS_WEBHOOK_DAMAS',
    actividades: [
      { id: 'Gimnasio', nombre: 'Gimnasio', tag: 'Entrenamiento', icono: '🏋️‍♀️', requiereDatos: true },
      { id: 'Fuera del Gym', nombre: 'Outdoor', tag: 'Fuera del gym', icono: '🏃‍♀️', requiereDatos: true },
      { id: 'Vacaciones', nombre: 'Vacaciones', tag: 'Descanso', icono: '🌴', requiereDatos: false },
      { id: 'Incapacidad', nombre: 'Incapacidad', tag: 'Salud', icono: '🏥', requiereDatos: false },
      { id: 'Periodo Menstrual', nombre: 'Periodo Menstrual', tag: 'Justificado · máx. 2 días/mes', icono: '🌸', requiereDatos: false, ancho: 'full', tema: 'period' },
    ],
    reglasTexto: {
      Gimnasio: '🎯 Mínimo: <b>1 hora</b> de entrenamiento',
      'Fuera del Gym': '🏃 Mínimo: <b>90 min / 350 kcal</b> ó <b>500 kcal en menos de 2 hrs</b>',
      'Periodo Menstrual': '🌸 Periodo Menstrual justificado — <b>máx. 2 días por mes</b>.',
      default: '🌴 Día de descanso o justificante médico — sin requisitos.',
    },
    evaluar(tipo, minutos, kcal) {
      if (tipo === 'Gimnasio') return minutos >= 60 ? 'CUMPLE' : 'NO CUMPLE';
      if (tipo === 'Fuera del Gym')
        return (minutos >= 90 && kcal >= 350) || (kcal >= 500 && minutos <= 120) ? 'CUMPLE' : 'NO CUMPLE';
      if (tipo === 'Vacaciones' || tipo === 'Incapacidad' || tipo === 'Periodo Menstrual') return 'JUSTIFICADO';
      return 'N/A';
    },
    limites: {
      Vacaciones: { periodo: 'anual', max: 13, mensaje: 'Ya agotaste tus 13 días de vacaciones anuales.' },
      'Periodo Menstrual': { periodo: 'mensual', max: 2, mensaje: 'Ya usaste tus 2 días de periodo este mes.' },
    },
  },
};

export function getReto(id) {
  return RETOS[id] || null;
}

export const LISTA_RETOS = Object.values(RETOS);
