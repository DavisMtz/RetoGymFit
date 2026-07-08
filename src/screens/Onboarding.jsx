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
import { getInitials, Avatar, vibrate, PeopleSkeleton } from '../components/ui';

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
  const { crearCuenta, iniciarSesion, iniciarSesionAdmin } = useAuth();

  const [paso, setPaso] = useState(1);
  const [modalAdmin, setModalAdmin] = useState(false);
  const [passAdmin, setPassAdmin] = useState('');
  const [errorAdmin, setErrorAdmin] = useState('');
  const [entrandoAdmin, setEntrandoAdmin] = useState(false);
  const [reto, setReto] = useState(null);
  const [usuarios, setUsuarios] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [recargar, setRecargar] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [modalOlvido, setModalOlvido] = useState(false);

  useEffect(() => {
    document.body.dataset.reto = reto?.id || '';
  }, [reto]);

  // Cargar participantes al elegir reto. Firestore responde en milisegundos
  // (caché local) → se muestra AL INSTANTE; la pestaña "Usuarios" del Google
  // Sheet es la fuente viva del roster y refina la lista al llegar (arranque
  // en frío del Apps Script: 2–5 s). Si ambas fallan, se marca error real.
  useEffect(() => {
    if (!reto) return undefined;
    setUsuarios(null);
    setErrorCarga(false);
    let activo = true;

    // 1) Firestore primero: vista instantánea
    const pFirestore = obtenerUsuariosActivos(reto.id)
      .then((fs) => {
        // Preview inmediato (solo si aún no llegó la hoja autoritativa)
        if (activo && fs.length) setUsuarios((prev) => prev ?? fs);
        return fs;
      })
      .catch(() => []);

    // 2) Google Sheet: fuente viva del roster; reconcilia al llegar
    const pSheet = obtenerUsuariosSheet(reto.id).then((s) => s).catch(() => null);

    Promise.all([pSheet, pFirestore]).then(([deSheet, deFirestore]) => {
      if (!activo) return;
      if (deSheet === null && !deFirestore.length) {
        setErrorCarga(true);
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
              resetGen: docFS?.resetGen || 0,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      );
    });

    return () => { activo = false; };
  }, [reto, recargar]);

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

  async function entrarAdmin(e) {
    e.preventDefault();
    setErrorAdmin('');
    if (!passAdmin) { setErrorAdmin('Escribe la contraseña de administrador.'); return; }
    setEntrandoAdmin(true);
    vibrate(40);
    try {
      await iniciarSesionAdmin(passAdmin);
    } catch (err) {
      setErrorAdmin(mensajeError(err));
      setEntrandoAdmin(false);
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
        <button className="admin-link" type="button" onClick={() => { vibrate(); setModalAdmin(true); setPassAdmin(''); setErrorAdmin(''); }}>
          Acceso administrador
        </button>

        {/* Modal acceso admin */}
        <div className={`modal-overlay ${modalAdmin ? 'show' : ''}`}>
          <div className="modal">
            <h2>Super usuario</h2>
            <p>Ingresa la contraseña de administrador para gestionar el reto.</p>
            <form onSubmit={entrarAdmin}>
              <div className="field">
                <input
                  type="password"
                  placeholder="Contraseña de admin"
                  value={passAdmin}
                  onChange={(e) => setPassAdmin(e.target.value)}
                />
              </div>
              <p className="error-text">{errorAdmin}</p>
              <button className="btn-dark" type="submit" disabled={entrandoAdmin}>
                {entrandoAdmin ? 'Entrando…' : 'Entrar como admin'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setModalAdmin(false)}>Cancelar</button>
            </form>
          </div>
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
          {usuarios === null && <PeopleSkeleton rows={6} />}
          {errorCarga && (
            <div className="carga-error">
              <div className="carga-error-icon">📡</div>
              <b>No pudimos cargar la lista</b>
              <p>Revisa tu conexión e inténtalo de nuevo. Tus datos están a salvo.</p>
              <button className="btn-dark" type="button" onClick={() => { vibrate(); setRecargar((n) => n + 1); }}>
                Reintentar
              </button>
            </div>
          )}
          {usuarios !== null && !errorCarga && !usuarios.length && (
            <div className="rank-empty">Aún no hay participantes activos en este reto.</div>
          )}
          {usuarios !== null && !errorCarga && usuarios.length > 0 && !filtrados.length && (
            <div className="rank-empty">Ningún nombre coincide con «{busqueda.trim()}».</div>
          )}
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
          <button className="btn-secondary" type="button" onClick={() => { vibrate(); setModalOlvido(true); }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </div>

      {/* Modal olvidé mi contraseña */}
      <div className={`modal-overlay ${modalOlvido ? 'show' : ''}`}>
        <div className="modal">
          <div className="modal-icon">🔑</div>
          <h2>Recuperar tu acceso</h2>
          <p>
            Pídele al administrador del reto que <b>restablezca tu acceso</b>.
            En cuanto lo haga, vuelve aquí y podrás crear una contraseña nueva
            al entrar. Tu historial y tu racha quedan intactos.
          </p>
          <button className="btn-dark" type="button" onClick={() => setModalOlvido(false)}>Entendido</button>
        </div>
      </div>
    </div>
  );
}
