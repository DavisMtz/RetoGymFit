/** Componentes de UI compartidos */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DIAS_CORTOS, hoyMX, semanaISO, diasHasta } from '../lib/dates';
import ReglasSheet from './Reglas';

export const vibrate = (ms = 25) => { if (navigator.vibrate) navigator.vibrate(ms); };

export function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

/** Avatar: muestra la foto de perfil si existe, o las iniciales como respaldo.
 *  Aplica className para heredar el tamaño/estilo del contexto (rank-av, etc.). */
export function Avatar({ nombre, url, className = '', style }) {
  if (url) {
    return (
      <div
        className={className}
        style={{ ...style, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        role="img"
        aria-label={nombre}
      />
    );
  }
  return <div className={className} style={style}>{getInitials(nombre)}</div>;
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
      <button className="rules-pill" type="button" onClick={() => { vibrate(15); setReglas(true); }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z" /></svg>
        Reglas
      </button>
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
            onClick={() => vibrate(15)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
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
