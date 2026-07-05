/**
 * Onboarding en 3 pasos:
 *   1. Elegir reto (Mixto / Damas)
 *   2. Buscar tu nombre entre los participantes activos
 *   3. Contraseña — si es tu primera vez la creas; si ya tienes, la ingresas.
 * Al entrar, la sesión queda guardada en el dispositivo.
 */
import { useState, useEffect, useMemo } from 'react';
import { LISTA_RETOS } from '../config/retos';
import { obtenerUsuariosActivos } from '../data/queries';
import { obtenerUsuariosSheet, slugNombre } from '../lib/sheets';
import { useAuth } from '../context/AuthContext';
import { getInitials, Avatar, vibrate, useToast } from '../components/ui';

const IconSearch = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
const IconLock = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 118 0v4" /></svg>
);

function mensajeError(e) {
  const code = e?.code || '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Contraseña incorrecta. Intenta de nuevo.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera un momento.';
  if (code.includes('network')) return 'Sin conexión. Revisa tu señal.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('email-already-in-use') || code.includes('credential-already-in-use'))
    return 'Este perfil ya tiene cuenta en otro dispositivo. Usa tu contraseña.';
  return e?.message || 'Algo salió mal. Intenta de nuevo.';
}

export default function Onboarding() {
  const { crearCuenta, iniciarSesion } = useAuth();
  const toast = useToast();

  const [paso, setPaso] = useState(1);
  const [reto, setReto] = useState(null);
  const [usuarios, setUsuarios] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.body.dataset.reto = reto?.id || '';
  }, [reto]);

  // Cargar participantes al elegir reto. La fuente principal es la pestaña
  // "Usuarios" del Google Sheet (la administras ahí); Firestore aporta quién
  // ya tiene contraseña. Si la hoja no responde, usamos solo Firestore.
  useEffect(() => {
    if (!reto) return;
    setUsuarios(null);
    (async () => {
      const [deSheet, deFirestore] = await Promise.all([
        obtenerUsuariosSheet(reto.id).catch(() => null),
        obtenerUsuariosActivos(reto.id).catch(() => []),
      ]);
      if (deSheet === null && !deFirestore.length) {
        toast('No pude cargar la lista. Revisa tu conexión.', true);
        setUsuarios([]);
        return;
      }
      if (deSheet === null) { setUsuarios(deFirestore); return; }
      const porId = Object.fromEntries(deFirestore.map((d) => [d.id, d]));
      setUsuarios(
        deSheet
          .filter((u) => u.estado === 'Activo')
          .map((u) => {
            const id = slugNombre(u.nombre);
            const docFS = porId[id];
            return {
              id,
              nombre: u.nombre,
              estado: 'Activo',
              hasPassword: docFS?.hasPassword || false,
              authUid: docFS?.authUid || null,
              photoURL: docFS?.photoURL || null,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      );
    })();
  }, [reto, toast]);

  const filtrados = useMemo(() => {
    if (!usuarios) return [];
    const q = busqueda.toLowerCase().trim();
    return q ? usuarios.filter((u) => u.nombre.toLowerCase().includes(q)) : usuarios;
  }, [usuarios, busqueda]);

  const tienePass = Boolean(elegido?.hasPassword && elegido?.authUid);

  async function entrar(e) {
    e.preventDefault();
    setError('');
    if (pass.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (!tienePass && pass !== pass2) { setError('Las contraseñas no coinciden.'); return; }
    setEnviando(true);
    vibrate(40);
    try {
      if (tienePass) await iniciarSesion(reto.id, elegido, pass);
      else await crearCuenta(reto.id, elegido, pass);
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  }

  // ——— Paso 1: elegir reto
  if (paso === 1) {
    return (
      <div className="onboard">
        <div className="onboard-hero stagger">
          <div className="onboard-eyebrow">Reto del gym · 2026</div>
          <h1 className="onboard-title">Más fuerte<br /><em>que ayer.</em></h1>
          <p className="onboard-sub">Registra tus entrenamientos, defiende tu racha y compite por el bote. Elige tu reto para empezar.</p>
        </div>
        <div className="reto-cards stagger">
          {LISTA_RETOS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`reto-card ${r.id}`}
              onClick={() => { vibrate(); setReto(r); setPaso(2); }}
            >
              <div className="rc-mark">{r.marca}</div>
              <div className="rc-info">
                <b>{r.nombre}</b>
                <span>Reto {r.subtitulo} · {r.metaDiasSemana} días/semana</span>
              </div>
              <svg className="rc-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ——— Paso 2: buscar nombre
  if (paso === 2) {
    return (
      <div className="onboard">
        <button className="back-link" type="button" onClick={() => { setPaso(1); setReto(null); setBusqueda(''); }}>
          ← Cambiar reto
        </button>
        <div className="onboard-hero" style={{ margin: '8px 0 22px' }}>
          <div className="onboard-eyebrow">{reto.nombre}</div>
          <h1 className="onboard-title" style={{ fontSize: 'clamp(30px, 9vw, 40px)' }}>¿Quién <em>eres?</em></h1>
          <p className="onboard-sub">Busca tu nombre en la lista de participantes activos.</p>
        </div>
        <div className="search-wrap">
          {IconSearch}
          <input
            type="text"
            placeholder="Buscar tu nombre..."
            value={busqueda}
            autoComplete="off"
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="people-list">
          {usuarios === null && <div className="rank-empty">Cargando participantes…</div>}
          {usuarios !== null && !filtrados.length && <div className="rank-empty">No hay resultados. ¿Estás en la lista de activos?</div>}
          {filtrados.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className="person-row"
              style={{ animationDelay: `${Math.min(i * 0.05, 0.5)}s` }}
              onClick={() => { vibrate(); setElegido(u); setPass(''); setPass2(''); setError(''); setPaso(3); }}
            >
              <Avatar nombre={u.nombre} url={u.photoURL} className="person-av" />
              <div className="person-info">
                <b>{u.nombre}</b>
                <span>{u.hasPassword ? 'Cuenta activa' : 'Primera vez · sin contraseña'}</span>
              </div>
              <IconLock className={`person-lock ${u.hasPassword ? 'has-pass' : ''}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ——— Paso 3: contraseña
  return (
    <div className="onboard">
      <button className="back-link" type="button" onClick={() => setPaso(2)}>← Elegir otro nombre</button>
      <div className="pass-card">
        <div className="pass-avatar">{getInitials(elegido.nombre)}</div>
        <h2 className="pass-name">{elegido.nombre}</h2>
        <p className="pass-hint">
          {tienePass
            ? 'Ingresa tu contraseña para entrar al reto.'
            : 'Es tu primera vez aquí. Crea una contraseña para proteger tu perfil — la usarás si cambias de dispositivo.'}
        </p>
        <form onSubmit={entrar}>
          <div className="field">
            <label className="field-label">{tienePass ? 'Tu contraseña' : 'Crea tu contraseña'}</label>
            <input
              type="password"
              value={pass}
              placeholder="••••••••"
              autoFocus
              onChange={(e) => setPass(e.target.value)}
            />
          </div>
          {!tienePass && (
            <div className="field">
              <label className="field-label">Confírmala</label>
              <input type="password" value={pass2} placeholder="••••••••" onChange={(e) => setPass2(e.target.value)} />
            </div>
          )}
          <p className="error-text">{error}</p>
          <button className="submit-btn" type="submit" disabled={enviando}>
            <span className="submit-btn-content">
              {enviando ? 'Entrando…' : tienePass ? 'Entrar al reto' : 'Crear y entrar'}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </button>
        </form>
        {tienePass && (
          <button className="btn-secondary" type="button" onClick={() => toast('Pide al admin restablecer tu acceso desde la consola de Firebase.', false)}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>
    </div>
  );
}
