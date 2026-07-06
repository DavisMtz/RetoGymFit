/**
 * Reglamento oficial del reto (documento "GYM — RETO 2026").
 * Estructurado por secciones para consultarse desde la app de forma
 * interactiva. Las diferencias entre Mixto y Damas (mínimos, días,
 * periodo menstrual) se resuelven con la config del reto.
 */

export function reglasDelReto(reto) {
  const esDamas = reto.id === 'damas';
  return [
    {
      id: 'tiempos',
      icono: '🎯',
      titulo: 'Tiempos',
      resumen: `${reto.metaDiasSemana} días/semana · lun a dom`,
      items: [
        `El objetivo es mantener la constancia física, con un mínimo de <b>${reto.metaDiasSemana} días de entrenamiento a la semana</b>.`,
        'La semana corre de <b>lunes a domingo</b>.',
        esDamas
          ? 'En el GYM enfocaremos un tiempo mínimo de <b>1 hora por sesión</b>.'
          : 'En el GYM enfocaremos un tiempo mínimo de <b>1:15 hrs ó 500 kcal por sesión</b>.',
        esDamas
          ? 'Fuera del gym el objetivo es superar retos: completar <b>90 minutos</b> de movimiento (quemando al menos <b>350 kcal</b>) o alcanzar <b>500 kcal antes de las 2 horas</b>. ¡Tú eliges qué récord romper primero!'
          : 'Fuera del gym el objetivo es superar retos: completar <b>90 minutos</b> de movimiento (quemando al menos <b>550 kcal</b>) o alcanzar <b>700 kcal antes de las 2 horas</b>. ¡Tú eliges qué récord romper primero!',
        `El esfuerzo adicional ¡¡tiene recompensa!! Al completar un <b>${reto.diaBonus}º día</b> de entrenamiento obtendrás <b>1 punto</b>, que servirá como criterio de desempate a tu favor.`,
      ],
    },
    {
      id: 'evidencias',
      icono: '📸',
      titulo: 'Evidencias',
      resumen: '3 fotos · rostro + seña diaria',
      items: [
        'Realiza tu <b>check-in</b> capturando tu asistencia del día en la aplicación, para que cuente tu día.',
        'Para que tu esfuerzo sea válido, captura <b>tres momentos clave con fecha y hora</b>: tu inicio, la evidencia de tu reloj y/o actividad, y tu gran cierre. Compártelas juntas en el grupo de WhatsApp.',
        'Mantengamos la claridad en el registro: cada evidencia debe mostrar <b>tu rostro y la seña diaria</b>.',
        'Para que tus fotos sean válidas, captura el ambiente de tu actividad física — evita fondos de pared, techo, piso, cama, etc.',
        '¡Que nada detenga tu avance! Si tu reloj falla, respalda tu actividad con un <b>video de al menos 2 minutos en cámara rápida</b>.',
      ],
    },
    {
      id: 'penalizaciones',
      icono: '💸',
      titulo: 'Penalizaciones',
      resumen: `$${reto.multaSemanal} MXN por semana incumplida`,
      items: [
        `Si una semana no logras la meta mínima, aportas <b>$${reto.multaSemanal}.00 MXN</b> a la cuenta compartida vía WhatsApp.`,
        'Cuentas claras: nos ponemos al día con las aportaciones <b>a más tardar el último día del mes penalizado</b>.',
        'Si una penalización se atrasa más de una quincena, se suman <b>$10 MXN adicionales por semana penalizada</b> como apoyo al fondo del equipo.',
        "Para registrar tu pago, transfiere y comparte el comprobante en el grupo de WhatsApp con el motivo <b>'GYM semana X'</b> (ej. GYM Semana 5).",
        'No se aceptan pagos en efectivo.',
      ],
    },
    {
      id: 'vacaciones',
      icono: '🌴',
      titulo: 'Vacaciones',
      resumen: '13 días al año',
      items: [
        'Tu bienestar es prioridad: dispones de <b>13 días anuales</b> para recargar energías, organizándolos como mejor se adapte a tus planes.',
        'Solicita tus vacaciones por mensaje de WhatsApp <b>dentro del mes en el que las vas a disfrutar</b>.',
      ],
    },
    {
      id: 'incapacidades',
      icono: '🏥',
      titulo: 'Incapacidades',
      resumen: esDamas ? 'Justificante médico · +2 días/mes 🌸' : 'Con justificante médico',
      items: [
        'Las ausencias por motivos médicos se validan con la <b>fecha de tu justificante médico</b>. Así el sistema es justo y reconoce tu situación de salud.',
        ...(esDamas
          ? ['¡Tu salud integral es clave! Se otorgan <b>2 días de descanso al mes por periodo menstrual</b>, asegurando el espacio necesario para tu autocuidado. 🌸']
          : []),
      ],
    },
    {
      id: 'bajas',
      icono: '👋',
      titulo: 'Bajas',
      resumen: '$100 MXN por mes pendiente',
      items: [
        '¡Nos encantaría que te quedaras hasta el final! Si decides darte de baja anticipadamente, se contempla un ajuste de compromiso de <b>$100 MXN por cada mes pendiente</b> para finalizar el reto, fortaleciendo el fondo común del grupo.',
      ],
    },
    {
      id: 'ganadores',
      icono: '🏆',
      titulo: 'Ganadores',
      resumen: '50% · 30% · 20% del bote',
      items: [
        '¡Todo el esfuerzo tiene su recompensa! El fondo acumulado se distribuye entre los <b>3 campeones de constancia</b> con el menor número de penalizaciones:',
        '🥇 <b>1er lugar:</b> se lleva el <b>50%</b> del gran total.',
        '🥈 <b>2do lugar:</b> obtiene el <b>30%</b> del gran total.',
        '🥉 <b>3er lugar:</b> recibe el <b>20%</b> del gran total.',
      ],
    },
  ];
}

export const FRASE_REGLAMENTO = 'No te detengas cuando estés cansado, detente cuando hayas terminado.';
