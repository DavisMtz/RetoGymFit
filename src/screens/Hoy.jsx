/**
 * Pantalla HOY: saludo + racha + semana visual + formulario de registro.
 * El estatus (CUMPLE / NO CUMPLE / JUSTIFICADO) se calcula con las reglas
 * del reto y se guarda en Firestore; después se replica a Google Sheets.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Header, StatusStrip, Countdown, WeekDots, getInitials, useCountUp } from '../components/ui';
import {
  obtenerRegistroHoy, guardarRegistro, contarPorTipo,
  obtenerHistorial, obtenerRankingSemanal,
  obtenerQuienesEntrenaronHoy, obtenerUsuariosActivos, publicarPostRegistro,
} from '../data/queries';
import { sincronizarRegistro } from '../lib/sheets';
import { entradaCelebracion } from '../lib/anim';
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

/**
 * Overlay de celebración tras registrar el día: racha, semana encendiéndose
 * y mensaje según qué tan cerca estás de asegurar la semana.
 */
function Celebracion({ reto, datos, onCerrar }) {
  const ref = useRef(null);
  const rachaAnim = useCountUp(datos ? datos.racha : null, 1100);

  useEffect(() => {
    if (datos) return entradaCelebracion(ref.current);
    return undefined;
  }, [datos]);

  let icono = '💪';
  let titulo = <>Misión <em>cumplida.</em></>;
  let msg = '';
  let justificado = false;
  // ¿La actividad registrada exige evidencia (fotos por WhatsApp)?
  const requiereEvidencia = datos
    ? Boolean(reto.actividades.find((a) => a.id === datos.tipo)?.requiereDatos)
    : false;
  if (datos) {
    const { dias, estatus, tipo } = datos;
    const meta = reto.metaDiasSemana;
    if (estatus === 'JUSTIFICADO') {
      justificado = true;
      icono = tipo === 'Periodo Menstrual' ? '🌸' : tipo === 'Incapacidad' ? '🩹' : '🌴';
      titulo = <>Día <em>justificado.</em></>;
      msg = 'Quedó registrado y cuenta para tu semana. Descansa y vuelve más fuerte.';
    } else if (dias >= meta) {
      icono = '🏆';
      titulo = <>¡Semana <em>completa!</em></>;
      msg = `${dias} de ${meta} días — la multa ya no te alcanza. Ahora rompe récords.`;
    } else if (dias === meta - 1) {
      icono = '⚡';
      titulo = <>Casi <em>tuya.</em></>;
      msg = `Llevas ${dias} de ${meta} — a 1 día de asegurar la semana. No aflojes.`;
    } else {
      msg = `Día ${dias} de ${meta} esta semana. La constancia paga — tu equipo ya lo vio.`;
    }
  }

  return (
    <div className={`celebra-overlay ${datos ? 'show' : ''}`} role="dialog" aria-modal="true" aria-label="Registro guardado">
      {datos && (
        <div className="celebra" ref={ref}>
          <div className={`celebra-icono ${justificado ? 'justificado' : ''}`}>{icono}</div>
          <h2 className="celebra-titulo celebra-anim">{titulo}</h2>
          <p className="celebra-msg celebra-anim">{msg}</p>
          <div className="celebra-stats celebra-anim">
            <div className="celebra-stat">
              <b>{rachaAnim == null ? datos.racha : Math.round(rachaAnim)}</b>
              <span>Racha 🔥</span>
            </div>
            <div className="celebra-stat">
              <b>{datos.dias}<small style={{ fontSize: 14 }}>/{reto.metaDiasSemana}</small></b>
              <span>Semana</span>
            </div>
          </div>
          {datos.semana && <div className="celebra-anim"><WeekDots semana={datos.semana} /></div>}
          <div className="celebra-cta celebra-anim">
            {requiereEvidencia ? (
              <>
                <a
                  className="btn-wa"
                  href={datos.waUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => { vibrate(20); onCerrar(); }}
                >
                  Enviar evidencia por WhatsApp
                </a>
                <button className="celebra-btn-sec" type="button" onClick={() => { vibrate(); onCerrar(); }}>
                  Ya la envié
                </button>
              </>
            ) : (
              <>
                <button className="celebra-btn" type="button" onClick={() => { vibrate(20); onCerrar(); }}>
                  Continuar
                </button>
                {datos.waUrl && (
                  <a
                    className="celebra-btn-sec"
                    href={datos.waUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onCerrar()}
                  >
                    Avisar al grupo por WhatsApp
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Barra grupal: quiénes del equipo ya entrenaron hoy.
 * Al tocarla, la tarjeta se expande (morph) y la tira de avatares se
 * transforma en una lista detallada con nombre y hora del registro.
 */
function EquipoHoy({ equipo }) {
  const [expandido, setExpandido] = useState(false);
  if (!equipo || !equipo.total) return null;
  const n = equipo.entrenaron.length;
  const pct = Math.min((n / equipo.total) * 100, 100);
  const visibles = equipo.entrenaron.slice(0, 8);
  const extra = n - visibles.length;
  const horaDe = (e) => (e.creadoEn
    ? e.creadoEn.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' })
    : '');
  const toggle = () => { if (!n) return; vibrate(12); setExpandido((v) => !v); };
  return (
    <div
      className={`equipo-hoy ${n > 0 ? 'tocable' : ''} ${expandido ? 'expandido' : ''}`}
      role={n > 0 ? 'button' : undefined}
      tabIndex={n > 0 ? 0 : undefined}
      aria-expanded={n > 0 ? expandido : undefined}
      aria-label={n > 0 ? 'El equipo hoy — toca para ver quiénes ya entrenaron y a qué hora' : undefined}
      onClick={toggle}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } }}
    >
      <div className="equipo-hoy-head">
        <span className="equipo-hoy-label">El equipo hoy</span>
        <span className="equipo-hoy-num">
          <b>{n}</b> de {equipo.total}
          {n > 0 && (
            <svg className="equipo-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          )}
        </span>
      </div>
      <div className="equipo-avs">
        {n === 0 && <span style={{ fontSize: 12, color: 'var(--text-low)' }}>Nadie ha entrenado aún — abre tú el marcador 🏁</span>}
        {visibles.map((e, i) => (
          <span
            className="equipo-av"
            key={e.usuarioId}
            title={e.nombre}
            style={{
              animationDelay: `${i * 0.05}s`,
              ...(equipo.fotos[e.usuarioId] ? { backgroundImage: `url(${equipo.fotos[e.usuarioId]})` } : {}),
            }}
          >
            {!equipo.fotos[e.usuarioId] && getInitials(e.nombre)}
          </span>
        ))}
        {extra > 0 && <span className="equipo-av mas" style={{ animationDelay: `${visibles.length * 0.05}s` }}>+{extra}</span>}
      </div>
      <div className="equipo-detalle" aria-hidden={!expandido}>
        <div className="equipo-detalle-inner">
          {equipo.entrenaron.map((e, i) => (
            <div className="equipo-det-row" key={e.usuarioId} style={{ '--i': i }}>
              <span
                className="equipo-det-av"
                style={equipo.fotos[e.usuarioId] ? { backgroundImage: `url(${equipo.fotos[e.usuarioId]})` } : undefined}
              >
                {!equipo.fotos[e.usuarioId] && getInitials(e.nombre)}
              </span>
              <span className="equipo-det-nombre">{e.nombre}</span>
              {horaDe(e) && (
                <span className="equipo-det-hora">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  {horaDe(e)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="equipo-track"><div className="equipo-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Hoy() {
  const { reto, usuario } = useAuth();
  const toast = useToast();

  const [registroHoy, setRegistroHoy] = useState(undefined); // undefined = cargando
  const [semana, setSemana] = useState(null);
  const [racha, setRacha] = useState(0);
  const [diasSemana, setDiasSemana] = useState(0);
  const [posicion, setPosicion] = useState(null); // { pos, total, rival, faltan }
  const [equipo, setEquipo] = useState(null);     // { entrenaron, total, fotos }
  const [celebracion, setCelebracion] = useState(null); // { racha, dias, semana, estatus, tipo, waUrl }

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
    const [regHoy, historial, ranking, entrenaron, activos] = await Promise.all([
      obtenerRegistroHoy(reto.id, usuario.id),
      obtenerHistorial(reto.id, usuario.id, 120),
      obtenerRankingSemanal(reto),
      obtenerQuienesEntrenaronHoy(reto.id).catch(() => []),
      obtenerUsuariosActivos(reto.id).catch(() => []),
    ]);
    setRegistroHoy(regHoy);
    const cumplidas = historial.filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO').map((r) => r.fecha);
    const rachaCalc = calcularRacha(cumplidas);
    setRacha(rachaCalc);
    const dias = {};
    historial.forEach((r) => { dias[r.fecha] = r.estatus; });
    // Semana visual a partir del historial
    const semanaCalc = diasDeSemana(hoyMX()).map((fecha) => ({ fecha, estatus: dias[fecha] || 'sin registro' }));
    setSemana(semanaCalc);
    const mio = ranking.find((r) => r.usuarioId === usuario.id);
    const diasCalc = mio ? mio.dias : 0;
    setDiasSemana(diasCalc);
    // Barra grupal: quiénes ya entrenaron hoy (solo participantes activos)
    if (activos.length) {
      const idsActivos = new Set(activos.map((u) => u.id));
      setEquipo({
        entrenaron: entrenaron.filter((e) => idsActivos.has(e.usuarioId)),
        total: activos.length,
        fotos: Object.fromEntries(activos.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])),
      });
    }
    // Posición competitiva de la semana: dónde vas y a quién puedes cazar
    const idx = ranking.findIndex((r) => r.usuarioId === usuario.id);
    if (idx !== -1 && ranking.length > 1) {
      const rival = idx > 0 ? ranking[idx - 1] : ranking[1];
      setPosicion({
        pos: idx + 1,
        total: ranking.length,
        rival: rival.nombre.split(' ')[0],
        faltan: idx > 0 ? rival.dias - ranking[idx].dias : ranking[0].dias - rival.dias,
      });
    } else {
      setPosicion(null);
    }
    // Valores frescos para quien los necesite justo después de guardar
    return { racha: rachaCalc, dias: diasCalc, semana: semanaCalc };
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

      const waUrl = construirMsgWA(datos, estatus);
      const cumple = estatus === 'CUMPLE' || estatus === 'JUSTIFICADO';
      setTipo(''); setHoras(''); setMinutos(''); setCalorias(''); setNotas(''); setHonor(false);
      const fresco = await cargar();

      // Autopost al feed: la actividad + la nota que la acompañó.
      // El Periodo Menstrual nunca se publica, por privacidad.
      if (cumple && datos.tipo !== 'Periodo Menstrual') {
        publicarPostRegistro(reto.id, usuario, registro, fresco.racha);
      }

      if (cumple) {
        lanzarConfetti(colores);
        vibrate([30, 40, 60]);
        setCelebracion({ ...fresco, estatus, tipo: datos.tipo, waUrl });
      } else {
        setModalWA({ url: waUrl });
      }
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
  const diasAnim = useCountUp(diasSemana, 800);

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
          <div className="hero-stat-num">{Math.round(diasAnim ?? diasSemana)}<span>/{reto.metaDiasSemana}</span></div>
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

      <EquipoHoy equipo={equipo} />

      {posicion && (
        <Link to="/ranking" className="posicion-strip" onClick={() => vibrate(12)}>
          <span className="posicion-badge">#{posicion.pos}</span>
          <span className="posicion-text">
            {posicion.pos === 1
              ? <>Lideras la semana{posicion.faltan > 0 ? <> con <b>{posicion.faltan} día{posicion.faltan !== 1 ? 's' : ''}</b> de ventaja sobre <b>{posicion.rival}</b></> : <> — <b>{posicion.rival}</b> te pisa los talones</>}.</>
              : posicion.faltan > 0
                ? <>Vas <b>#{posicion.pos}</b> de {posicion.total} — a <b>{posicion.faltan} día{posicion.faltan !== 1 ? 's' : ''}</b> de cazar a <b>{posicion.rival}</b>.</>
                : <>Vas <b>#{posicion.pos}</b> de {posicion.total} — empate en días con <b>{posicion.rival}</b>: las kcal deciden.</>}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </Link>
      )}

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
              <textarea rows="2" maxLength="500" placeholder="¿Algún récord, sensación o detalle?" value={notas} onChange={(e) => setNotas(e.target.value)} />
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

      {/* Celebración post-registro: el CTA de WhatsApp vive dentro, un tap menos */}
      <Celebracion
        reto={reto}
        datos={celebracion}
        onCerrar={() => setCelebracion(null)}
      />

      {/* Modal WhatsApp (solo para registros que NO cumplen; el flujo de
          celebración ya trae su propio botón de evidencia) */}
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
