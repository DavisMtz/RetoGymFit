/**
 * Pantalla HOY: saludo + racha + semana visual + formulario de registro.
 * El estatus (CUMPLE / NO CUMPLE / JUSTIFICADO) se calcula con las reglas
 * del reto y se guarda en Firestore; después se replica a Google Sheets.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Header, StatusStrip, Countdown, WeekDots } from '../components/ui';
import {
  obtenerRegistroHoy, guardarRegistro, contarPorTipo,
  obtenerHistorial, obtenerRankingSemanal,
} from '../data/queries';
import { sincronizarRegistro } from '../lib/sheets';
import { calcularRacha, hoyMX, diasDeSemana } from '../lib/dates';

const FRASES = {
  urgencia: [
    '¡No te quedes atrás! Hoy es tu oportunidad.',
    'La multa duele más que el gym. ¡Muévete!',
    'Tu equipo te necesita. Dale con todo hoy.',
    'Queda poco tiempo. Cada minuto cuenta.',
  ],
  normal: [
    'La disciplina es el puente entre metas y logros.',
    'Tu única competencia es quien eras ayer.',
    'El sudor de hoy es la fuerza de mañana.',
    'Pequeños pasos, grandes resultados.',
    'Transforma tus excusas en esfuerzo.',
  ],
  celebracion: [
    '¡Ya cumpliste la semana! Ahora rompe récords.',
    'Semana SÓLIDA. Imparable.',
    '¡Así se hace el reto! Sigue construyendo.',
    'Leyenda en progreso. No pares.',
  ],
};

function lanzarConfetti(colores) {
  const end = Date.now() + 2200;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors: colores });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors: colores });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export default function Hoy() {
  const { reto, usuario } = useAuth();
  const toast = useToast();

  const [registroHoy, setRegistroHoy] = useState(undefined); // undefined = cargando
  const [semana, setSemana] = useState(null);
  const [racha, setRacha] = useState(0);
  const [diasSemana, setDiasSemana] = useState(0);

  const [tipo, setTipo] = useState('');
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');
  const [calorias, setCalorias] = useState('');
  const [notas, setNotas] = useState('');
  const [honor, setHonor] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [modalWA, setModalWA] = useState(null); // { url }

  const actividad = reto.actividades.find((a) => a.id === tipo);
  const colores = ['#d4ff00', '#ffffff', '#4ade80', ...(reto.acentoSecundario ? [reto.acentoSecundario] : [])];

  const cargar = useCallback(async () => {
    const [regHoy, historial, ranking] = await Promise.all([
      obtenerRegistroHoy(reto.id, usuario.id),
      obtenerHistorial(reto.id, usuario.id, 120),
      obtenerRankingSemanal(reto),
    ]);
    setRegistroHoy(regHoy);
    const cumplidas = historial.filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO').map((r) => r.fecha);
    setRacha(calcularRacha(cumplidas));
    const dias = {};
    historial.forEach((r) => { dias[r.fecha] = r.estatus; });
    // Semana visual a partir del historial
    setSemana(diasDeSemana(hoyMX()).map((fecha) => ({ fecha, estatus: dias[fecha] || 'sin registro' })));
    const mio = ranking.find((r) => r.usuarioId === usuario.id);
    setDiasSemana(mio ? mio.dias : 0);
  }, [reto, usuario]);

  useEffect(() => { cargar().catch(() => toast('Error al cargar tus datos', true)); }, [cargar, toast]);

  const frase = useMemo(() => {
    const dayNorm = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const faltan = reto.metaDiasSemana - diasSemana;
    const quedan = 8 - dayNorm;
    let pool = FRASES.normal;
    if (diasSemana >= reto.metaDiasSemana) pool = FRASES.celebracion;
    else if (faltan > 0 && quedan <= faltan) pool = FRASES.urgencia;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [diasSemana, reto.metaDiasSemana]);

  // Zona de peligro: ¿alcanza a cumplir la semana?
  const peligro = useMemo(() => {
    const faltan = reto.metaDiasSemana - diasSemana;
    const dayNorm = new Date().getDay() === 0 ? 7 : new Date().getDay();
    const quedanInclHoy = 8 - dayNorm;
    if (faltan > 0 && quedanInclHoy <= faltan + 1) return { faltan, critico: quedanInclHoy <= faltan };
    return null;
  }, [diasSemana, reto.metaDiasSemana]);

  function construirMsgWA(datos, estatus) {
    const fechaHoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    let msg = `🏋️ *REPORTE ${reto.nombre}*\n👤 *Atleta:* ${usuario.nombre}\n📅 *Fecha:* ${fechaHoy}\n📍 *Actividad:* ${datos.tipo}\n`;
    if (actividad?.requiereDatos) {
      msg += `⏱ *Tiempo:* ${Math.floor(datos.minutos / 60)}:${String(datos.minutos % 60).padStart(2, '0')} hrs\n🔥 *Calorías:* ${datos.calorias} kcal\n`;
      if (datos.notas) msg += `📝 *Notas:* ${datos.notas}\n`;
      msg += `\n✅ *CÓDIGO DE HONOR CONFIRMADO*\nAdjunto mis 3 fotos (Inicio, Reloj, Fin).`;
    } else {
      msg += `${datos.tipo === 'Periodo Menstrual' ? '🌸' : '🌴'} *Estado:* ${estatus === 'JUSTIFICADO' ? 'Justificado' : 'Descanso'}\n`;
      if (datos.notas) msg += `📝 *Detalle:* ${datos.notas}`;
    }
    return 'https://wa.me/?text=' + encodeURIComponent(msg);
  }

  async function onSubmit(e) {
    e.preventDefault();
    vibrate(40);
    if (!tipo) { toast('Elige tu actividad de hoy', true); return; }
    if (actividad.requiereDatos && !honor) { toast('Confirma el código de honor', true); return; }
    if (actividad.requiereDatos && !calorias) { toast('Indica las calorías', true); return; }

    setEnviando(true);
    try {
      // Límites (vacaciones anuales, periodo mensual)
      const limite = reto.limites[tipo];
      if (limite) {
        const usados = await contarPorTipo(reto.id, usuario.id, tipo, limite.periodo);
        if (usados >= limite.max) { toast(`⛔ ${limite.mensaje}`, true); setEnviando(false); return; }
      }

      const mins = (parseInt(horas || '0', 10) * 60) + parseInt(minutos || '0', 10);
      const kcal = actividad.requiereDatos ? parseInt(calorias || '0', 10) : 0;
      const estatus = reto.evaluar(tipo, actividad.requiereDatos ? mins : 0, kcal);
      const datos = {
        tipo,
        minutos: actividad.requiereDatos ? mins : 0,
        calorias: kcal,
        evidencia: actividad.requiereDatos ? (honor ? 'SÍ' : 'NO') : 'N/A',
        estatus,
        notas: notas.trim(),
      };

      const registro = await guardarRegistro(reto.id, usuario, datos);
      sincronizarRegistro(reto, registro); // replica a Google Sheets (no bloquea)

      lanzarConfetti(colores);
      setModalWA({ url: construirMsgWA(datos, estatus) });
      setTipo(''); setHoras(''); setMinutos(''); setCalorias(''); setNotas(''); setHonor(false);
      await cargar();
    } catch (err) {
      const msg = err?.code === 'permission-denied' || String(err).includes('already exists')
        ? 'Ya existe un registro tuyo el día de hoy.'
        : 'No se pudo guardar. Intenta de nuevo.';
      toast(msg, true);
    } finally {
      setEnviando(false);
    }
  }

  const progresoPct = Math.min((diasSemana / reto.metaDiasSemana) * 100, 100);

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />
      <Countdown reto={reto} />

      <section className="hero stagger">
        <div className="hero-eyebrow">Tu reto · Esta semana</div>
        <h1 className="hero-title">Más fuerte<br /><em>que ayer.</em></h1>
        <p className="hero-sub">Registra tu actividad de hoy. Tu equipo te está viendo.</p>
        <div className="hero-stat">
          <div className="hero-stat-num">{diasSemana}<span>/{reto.metaDiasSemana}</span></div>
          <div className="hero-stat-label">Días<br />completados</div>
        </div>
        <div className="progress-track">
          <div className={`progress-fill ${diasSemana >= reto.metaDiasSemana ? 'complete' : ''}`} style={{ width: `${progresoPct}%` }} />
        </div>
      </section>

      <div className="greeting" style={{ display: 'block' }}>
        <h4>Hola, {usuario.nombre.split(' ')[0]}.</h4>
        <p>{frase}</p>
        {racha > 0 && (
          <div className="streak">
            <span className="streak-flame">{racha > 10 ? '🔥🔥🔥' : racha > 5 ? '🔥🔥' : '🔥'}</span>
            Racha · <b>{racha} días</b>
          </div>
        )}
        {semana && <WeekDots semana={semana} />}
      </div>

      {peligro && (
        <div className={`danger-strip ${peligro.critico ? 'critical' : ''}`}>
          <span className="danger-icon">⚠️</span>
          <span className="danger-text">
            Llevas <b>{diasSemana} día{diasSemana !== 1 ? 's' : ''}</b> esta semana — necesitas <b>{peligro.faltan} más</b> para no multar.
          </span>
        </div>
      )}

      {registroHoy === undefined && (
        <section className="card"><div className="rank-empty">Cargando tu día…</div></section>
      )}

      {registroHoy && (
        <section className="card">
          <div className="done-state">
            <div className="done-circle">
              <div className="done-circle-inner">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
            </div>
            <h3>Misión <em>cumplida.</em></h3>
            <p>Hoy ya registraste tu actividad. Mañana otra vez.</p>
            <div className="done-tag">Hoy: {registroHoy.tipo}</div>
            <a
              className="btn-wa"
              href={construirMsgWA(registroHoy, registroHoy.estatus)}
              target="_blank"
              rel="noreferrer"
            >
              Reenviar evidencia por WhatsApp
            </a>
          </div>
        </section>
      )}

      {registroHoy === null && (
        <section className="card">
          <div className="card-head"><h2 className="card-title">Registro de Hoy</h2></div>
          <form onSubmit={onSubmit} noValidate>
            <div className="activity-grid">
              {reto.actividades.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`activity-chip ${a.ancho === 'full' ? 'full' : ''} ${a.tema === 'period' ? 'period' : ''} ${tipo === a.id ? 'selected' : ''}`}
                  onClick={() => { vibrate(); setTipo(a.id); if (!a.requiereDatos) { setHoras(''); setMinutos(''); setCalorias(''); setHonor(false); } }}
                >
                  <span className="ac-icon">{a.icono}</span>
                  <div>
                    <div className="ac-name">{a.nombre}</div>
                    <div className="ac-tag">{a.tag}</div>
                  </div>
                </button>
              ))}
            </div>

            {tipo && (
              <div
                className={`rule-tag ${actividad?.tema === 'period' ? 'period' : ''}`}
                dangerouslySetInnerHTML={{ __html: reto.reglasTexto[tipo] || reto.reglasTexto.default }}
              />
            )}

            <div className={`dynamic-fields ${actividad?.requiereDatos ? 'show' : ''}`}>
              <div className="row-2">
                <div className="field">
                  <label className="field-label">Horas</label>
                  <div className="field-with-unit" data-unit="hrs">
                    <input type="number" min="0" max="10" placeholder="0" inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Minutos</label>
                  <div className="field-with-unit" data-unit="min">
                    <input type="number" min="0" max="59" placeholder="0" inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Calorías quemadas</label>
                <div className="field-with-unit" data-unit="kcal">
                  <input type="number" min="0" placeholder="0" inputMode="numeric" value={calorias} onChange={(e) => setCalorias(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="field">
              <label className="field-label">Notas (opcional)</label>
              <textarea rows="2" placeholder="¿Algún récord, sensación o detalle?" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>

            {actividad?.requiereDatos && (
              <div className={`honor ${honor ? 'active' : ''}`} onClick={() => { vibrate(); setHonor(!honor); }}>
                <div className="honor-switch" />
                <div className="honor-text">
                  <b>Código de Honor</b>
                  Confirmo que envié las 3 fotos (Inicio, Reloj, Fin) al grupo de WhatsApp.
                </div>
              </div>
            )}

            <button className="submit-btn" type="submit" disabled={enviando}>
              <span className="submit-btn-content">
                {enviando ? 'Guardando…' : 'Registrar actividad'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </button>
          </form>
        </section>
      )}

      {/* Modal WhatsApp */}
      <div className={`modal-overlay ${modalWA ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-icon success">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h2>¡Excelente trabajo!</h2>
          <p>Tu actividad quedó registrada. Ahora envía la evidencia al grupo de WhatsApp.</p>
          {modalWA && <a className="btn-wa" href={modalWA.url} target="_blank" rel="noreferrer">Enviar evidencia</a>}
          <button className="btn-secondary" type="button" onClick={() => setModalWA(null)}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
