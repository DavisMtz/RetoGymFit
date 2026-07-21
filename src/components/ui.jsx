/** Componentes de UI compartidos */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DIAS_CORTOS, hoyMX, semanaISO, diasHasta } from '../lib/dates';
import { abrirAvatar, punch } from '../lib/anim';
import ReglasSheet from './Reglas';
import NotiCampana from './Notificaciones';

export const vibrate = (ms = 25) => { if (navigator.vibrate) navigator.vibrate(ms); };

export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

/** Visor a pantalla completa de la foto de perfil de alguien. */
function VisorAvatar({ nombre, url, onClose }) {
  const fotoRef = useRef(null);
  const nombreRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    abrirAvatar(fotoRef.current, nombreRef.current);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="visor-avatar show" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Foto de ${nombre}`}>
      {url
        ? <img ref={fotoRef} className="visor-avatar-foto" src={url} alt={nombre} onClick={(e) => e.stopPropagation()} />
        : <div ref={fotoRef} className="visor-avatar-foto iniciales" onClick={(e) => e.stopPropagation()}>{getInitials(nombre)}</div>}
      <div ref={nombreRef} className="visor-avatar-nombre">{nombre}</div>
    </div>,
    document.body,
  );
}

/** Avatar: muestra la foto de perfil si existe, o las iniciales como respaldo.
 *  Aplica className para heredar el tamaño/estilo del contexto (rank-av, etc.).
 *  Con `ampliable`, tocarlo abre la foto en grande (no usar dentro de <button>). */
export function Avatar({ nombre, url, className = '', style, ampliable = false }) {
  const [abierto, setAbierto] = useState(false);

  const contenido = url
    ? (
      <div
        className={className}
        style={{ ...style, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        role="img"
        aria-label={nombre}
      />
    )
    : <div className={className} style={style}>{getInitials(nombre)}</div>;

  if (!ampliable) return contenido;
  return (
    <>
      <button
        type="button"
        className="avatar-ampliable"
        aria-label={`Ver foto de ${nombre}`}
        onClick={(e) => { e.stopPropagation(); vibrate(12); setAbierto(true); }}
      >
        {contenido}
      </button>
      {abierto && <VisorAvatar nombre={nombre} url={url} onClose={() => setAbierto(false)} />}
    </>
  );
}

// ——————————————————————————————— Toast

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, danger = false) => {
    clearTimeout(timer.current);
    setToast({ msg, danger });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast ${toast ? 'show' : ''} ${toast?.danger ? 'danger' : ''}`}>{toast?.msg}</div>
    </ToastContext.Provider>
  );
}

// ——————————————————————————————— Header + status strip

export function Header({ reto }) {
  const { usuario } = useAuth();
  const [reglas, setReglas] = useState(false);
  return (
    <header className="header">
      <NavLink to="/perfil" className="brand" onClick={() => vibrate(12)} aria-label="Ir a tu perfil">
        <div className="brand-avatar">
          <Avatar nombre={usuario?.nombre} url={usuario?.photoURL} className="brand-avatar-img" />
          <span className="brand-avatar-badge">{reto.marca}</span>
        </div>
        <div className="brand-text">
          <b>{reto.nombre}</b>
          <span>Disciplina · Constancia</span>
        </div>
      </NavLink>
      <div className="header-actions">
        <NotiCampana />
        <button className="rules-pill" type="button" onClick={() => { vibrate(15); setReglas(true); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z" /></svg>
          Reglas
        </button>
      </div>
      <ReglasSheet reto={reto} abierto={reglas} onClose={() => setReglas(false)} />
    </header>
  );
}

/** Número animado: sube con easing hasta el valor final (respeta reduced-motion). */
export function useCountUp(value, duracion = 1300) {
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    if (value == null) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMostrado(value); return undefined; }
    let raf;
    const inicio = performance.now();
    const tick = (ahora) => {
      const p = Math.min((ahora - inicio) / duracion, 1);
      setMostrado(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duracion]);
  return value == null ? null : mostrado;
}

/**
 * Estado de conexión del dispositivo. Devuelve `online` y `reciénReconectado`
 * (true durante ~3 s tras recuperar la señal, para confirmar visualmente).
 */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [reconectado, setReconectado] = useState(false);
  useEffect(() => {
    let t;
    const subir = () => {
      setOnline(true);
      setReconectado(true);
      clearTimeout(t);
      t = setTimeout(() => setReconectado(false), 3000);
    };
    const bajar = () => setOnline(false);
    window.addEventListener('online', subir);
    window.addEventListener('offline', bajar);
    return () => { window.removeEventListener('online', subir); window.removeEventListener('offline', bajar); clearTimeout(t); };
  }, []);
  return { online, reconectado };
}

/**
 * Pill flotante de conexión: avisa cuando no hay red (los registros se guardan
 * en local y se sincronizan al volver) y confirma brevemente la reconexión.
 * Vive sobre la tab bar, sin taparla.
 */
export function ConexionPill() {
  const { online, reconectado } = useOnline();
  if (online && !reconectado) return null;
  return createPortal(
    <div className={`conexion-pill ${online ? 'online' : 'offline'}`} role="status" aria-live="polite">
      {online ? (
        <>
          <span className="conexion-dot" /> De vuelta en línea — sincronizando…
        </>
      ) : (
        <>
          <span className="conexion-dot" /> Sin conexión — tu registro se guardará al reconectar
        </>
      )}
    </div>,
    document.body,
  );
}

export function StatusStrip() {
  const hoy = hoyMX();
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '').toUpperCase();
  return (
    <div className="status-strip">
      <span>SEM <b>{String(semanaISO(hoy)).padStart(2, '0')}</b></span>
      <span className="ss-divider" />
      <span>{fecha}</span>
      <span className="ss-divider" />
      <span>EST · MX</span>
    </div>
  );
}

export function Countdown({ reto }) {
  const dias = diasHasta(reto.fechaFin);
  const fin = new Date(reto.fechaFin + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/\./g, '');
  return (
    <div className="countdown-strip">
      <div className="cd-num">{dias <= 0 ? '¡Hoy!' : dias}</div>
      <div className="cd-info">
        <span className="cd-label">Días para<br />el fin del reto</span>
        <span className="cd-sub">{fin}</span>
      </div>
    </div>
  );
}

// ——————————————————————————————— Week dots

export function WeekDots({ semana }) {
  const hoy = hoyMX();
  return (
    <div className="week-dots">
      {semana.map((d, i) => {
        let cls = 'week-dot-circle';
        if (d.estatus === 'CUMPLE') cls += ' cumple';
        else if (d.estatus === 'JUSTIFICADO') cls += ' justif';
        else if (d.estatus === 'NO CUMPLE') cls += ' nocumple';
        if (d.fecha === hoy) cls += ' hoy';
        return (
          <div className="week-dot" key={d.fecha}>
            <div className={cls} style={{ animationDelay: `${i * 0.06}s` }} />
            <span className="week-dot-label">{DIAS_CORTOS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ——————————————————————————————— Tab bar

const TABS = [
  { to: '/', label: 'Hoy', icon: <path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" /> },
  { to: '/feed', label: 'Feed', icon: <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /> },
  { to: '/historial', label: 'Historial', icon: <path d="M12 8v4l3 3M3.05 11a9 9 0 11.5 4m-.5-4H7m-3.95 0L2 7" /> },
  { to: '/ranking', label: 'Ranking', icon: <path d="M8 21h8m-4-4v4m-6-17h12v4a6 6 0 01-12 0V4zM4 6h2m12 0h2a2 2 0 01-2 4h-1M4 6a2 2 0 002 4h1" /> },
  { to: '/stats', label: 'Stats', icon: <path d="M3 3v18h18M8 16v-5m5 5V8m5 8v-3" /> },
  { to: '/perfil', label: 'Perfil', icon: <path d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z" /> },
];

export function TabBar() {
  return (
    <nav className="tabbar">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
            onClick={(e) => { vibrate(15); punch(e.currentTarget.querySelector('svg'), 1.3); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

// ——————————————————————————————— Anillo de progreso semanal

/**
 * Envuelve un Avatar con un anillo SVG que marca el avance de la semana
 * (estilo anillos de actividad). `progreso` va de 0 a 1; se anima con una
 * transición CSS de stroke-dashoffset. Hereda el tamaño del avatar.
 */
export function AvatarRing({ nombre, url, progreso = 0, className = '', ampliable = false }) {
  const pct = Math.max(0, Math.min(1, Number(progreso) || 0)) * 100;
  const [dash, setDash] = useState(0);
  // Arranca en 0 y transiciona al valor real en el siguiente frame
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDash(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  return (
    <span className={`ring-wrap ${pct >= 100 ? 'ring-full' : ''}`}>
      <Avatar nombre={nombre} url={url} className={className} ampliable={ampliable} />
      <svg className="ring-svg" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ring-track" cx="18" cy="18" r="16.5" pathLength="100" />
        <circle
          className="ring-fill"
          cx="18" cy="18" r="16.5"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - dash}
        />
      </svg>
    </span>
  );
}

// ——————————————————————————————— Skeletons

export function RankSkeleton({ rows = 3 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li className="rank-skeleton" key={i}>
          <div className="sk sk-pos" /><div className="sk sk-av" /><div className="sk sk-text" /><div className="sk sk-tag" />
        </li>
      ))}
    </>
  );
}

/** Placeholder con shimmer de una publicación del feed mientras carga. */
export function PostSkeleton({ posts = 2 }) {
  return (
    <>
      {Array.from({ length: posts }, (_, i) => (
        <article className="post post-skeleton" key={i} aria-hidden="true">
          <div className="post-head">
            <div className="sk sk-av" />
            <div className="sk sk-text" style={{ maxWidth: 140 }} />
          </div>
          <div className="sk sk-line" />
          <div className="sk sk-line" style={{ width: '65%' }} />
          <div className="sk sk-foto" />
        </article>
      ))}
    </>
  );
}

/** Placeholder de filas genéricas (participantes del admin, listas). */
export function FilasSkeleton({ rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div className="rank-skeleton" style={{ listStyle: 'none' }} key={i} aria-hidden="true">
          <div className="sk sk-av" /><div className="sk sk-text" /><div className="sk sk-tag" />
        </div>
      ))}
    </>
  );
}

/** Placeholder de la lista de participantes del onboarding (mismo layout). */
export function PeopleSkeleton({ rows = 6 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div className="person-skeleton" key={i} aria-hidden="true">
          <div className="sk sk-av" />
          <div className="person-skeleton-lines">
            <div className="sk sk-text" style={{ height: 14, maxWidth: 160 }} />
            <div className="sk sk-text" style={{ height: 9, maxWidth: 90, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </>
  );
}

// ——————————————————————————————— Pull to refresh

/**
 * Gesto pull-to-refresh para PWA: jala hacia abajo desde el tope de la
 * página para recargar. Devuelve props para el indicador visual.
 *
 *   const ptr = usePullToRefresh(async () => { await cargar(); });
 *   ...
 *   <PullIndicator {...ptr} />
 *
 * Solo se activa con touch, con la página en el tope y jalando hacia abajo;
 * no interfiere con el scroll normal ni con gestos horizontales.
 */
export function usePullToRefresh(onRefresh) {
  const [estado, setEstado] = useState({ dist: 0, refrescando: false });
  const ref = useRef({ y0: 0, x0: 0, activo: false, dist: 0, refrescando: false });
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const UMBRAL = 70;
    const r = ref.current;

    function onStart(e) {
      if (r.refrescando || window.scrollY > 0) return;
      // No iniciar el gesto dentro de capas con su propio scroll/gestos
      if (e.target.closest('.modal-overlay.show, .sheet-overlay, .lightbox.show')) return;
      r.y0 = e.touches[0].clientY;
      r.x0 = e.touches[0].clientX;
      r.activo = true;
      r.dist = 0;
    }

    function onMove(e) {
      if (!r.activo || r.refrescando) return;
      const dy = e.touches[0].clientY - r.y0;
      const dx = Math.abs(e.touches[0].clientX - r.x0);
      if (dy < 8 || dx > Math.abs(dy)) {
        if (dy < 0) r.activo = false; // scroll normal hacia arriba
        return;
      }
      if (window.scrollY > 0) { r.activo = false; setEstado({ dist: 0, refrescando: false }); return; }
      // Amortiguación: cuesta más mientras más jalas
      r.dist = Math.min(dy * 0.45, 110);
      setEstado({ dist: r.dist, refrescando: false });
    }

    async function onEnd() {
      if (!r.activo || r.refrescando) return;
      r.activo = false;
      if (r.dist >= UMBRAL) {
        r.refrescando = true;
        setEstado({ dist: UMBRAL, refrescando: true });
        if (navigator.vibrate) navigator.vibrate(20);
        try { await cbRef.current?.(); } catch { /* el caller reporta sus errores */ }
        r.refrescando = false;
      }
      r.dist = 0;
      setEstado({ dist: 0, refrescando: false });
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);

  return estado;
}

export function PullIndicator({ dist, refrescando }) {
  const visible = dist > 4 || refrescando;
  return createPortal(
    <div
      className={`ptr-indicator ${visible ? 'show' : ''} ${refrescando ? 'refreshing' : ''}`}
      style={{ transform: `translate(-50%, ${visible ? dist : -10}px)` }}
      aria-hidden={!visible}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {refrescando
          ? <path d="M3 12a9 9 0 0115.36-6.36L21 8M21 3v5h-5" />
          : <path d="M12 5v14M5 12l7 7 7-7" />}
      </svg>
    </div>,
    document.body,
  );
}

// ——————————————————————————————— Anime intro (bienvenida cinemática)

const FRASES_INTRO = [
  'TU ESFUERZO CONSTANTE TIENE RESULTADOS INCREÍBLES.<br/>SIGUE ASÍ.',
  'LA DISCIPLINA DE HOY ES TU FUERZA DE MAÑANA.',
  'NO HAY LÍMITES PARA TU POTENCIAL.<br/>¡A ROMPERLA!',
  'CADA DÍA MÁS FUERTE.<br/>CADA DÍA MÁS INVENCIBLE.',
];

export function AnimeIntro({ nombre, genero, onDone }) {
  const [frase] = useState(() => FRASES_INTRO[Math.floor(Math.random() * FRASES_INTRO.length)]);
  useEffect(() => {
    vibrate([40, 50, 40]);
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone]);
  const saludo = genero === 'a' ? '¡BIENVENIDA,' : '¡BIENVENIDX,';
  return (
    <div className="anime-intro active">
      <div className="anime-bg-lines" />
      <div className="anime-slash" />
      <div className="anime-content">
        <h1 className="anime-title">
          {saludo}<br /><span style={{ color: '#fff' }}>{nombre.split(' ')[0].toUpperCase()}!</span>
        </h1>
        <p className="anime-subtitle" dangerouslySetInnerHTML={{ __html: frase }} />
      </div>
    </div>
  );
}
