/**
 * Perfil: identidad del atleta, días justificados disponibles,
 * reglamento, foto de perfil, cambio de contraseña y cierre de sesión.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar, Header, StatusStrip } from '../components/ui';
import ReglasSheet from '../components/Reglas';
import { obtenerHistorial, contarPorTipo } from '../data/queries';
import { subirAvatar, borrarAvatar } from '../lib/avatar';
import { pushDisponible, activarPush, desactivarPush } from '../lib/push';
import { calcularRacha } from '../lib/dates';

export default function Perfil() {
  const { reto, usuario, cerrarSesion, cambiarPassword, refrescarUsuario } = useAuth();
  const toast = useToast();
  const fileRef = useRef();
  const [foto, setFoto] = useState(usuario.photoURL || null);
  const [subiendo, setSubiendo] = useState(false);
  const [racha, setRacha] = useState(0);
  const [totalDias, setTotalDias] = useState(0);
  const [vacaciones, setVacaciones] = useState(null);
  const [periodo, setPeriodo] = useState(null);
  const [reglas, setReglas] = useState(false);
  const [modalPass, setModalPass] = useState(false);
  const [modalSalir, setModalSalir] = useState(false);
  const [modalQuitarFoto, setModalQuitarFoto] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pushOk, setPushOk] = useState(false);
  const [pushActivo, setPushActivo] = useState(Boolean(usuario.fcmToken));
  const [pushCargando, setPushCargando] = useState(false);

  useEffect(() => { pushDisponible().then(setPushOk); }, []);

  async function togglePush() {
    if (pushCargando) return;
    vibrate();
    setPushCargando(true);
    try {
      if (pushActivo) {
        await desactivarPush(reto.id, usuario.id);
        refrescarUsuario?.({ fcmToken: null });
        setPushActivo(false);
        toast('Notificaciones desactivadas');
      } else {
        await activarPush(reto.id, usuario.id);
        refrescarUsuario?.({ fcmToken: 'ok' });
        setPushActivo(true);
        vibrate([30, 40, 30]);
        toast('Notificaciones activadas ✓');
      }
    } catch (err) {
      toast(err?.message || 'No se pudieron activar las notificaciones.', true);
    } finally {
      setPushCargando(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const historial = await obtenerHistorial(reto.id, usuario.id, 400);
        const cumplidas = historial
          .filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO')
          .map((r) => r.fecha);
        setRacha(calcularRacha(cumplidas));
        setTotalDias(new Set(cumplidas).size);
        if (reto.limites.Vacaciones) {
          setVacaciones(await contarPorTipo(reto.id, usuario.id, 'Vacaciones', 'anual'));
        }
        if (reto.limites['Periodo Menstrual']) {
          setPeriodo(await contarPorTipo(reto.id, usuario.id, 'Periodo Menstrual', 'mensual'));
        }
      } catch { /* datos no críticos */ }
    })();
  }, [reto, usuario]);

  async function guardarPassword(e) {
    e.preventDefault();
    setError('');
    if (pass1.length < 6) { setError('Mínimo 6 caracteres.'); return; }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden.'); return; }
    setEnviando(true);
    try {
      await cambiarPassword(pass1);
      setModalPass(false); setPass1(''); setPass2('');
      toast('Contraseña actualizada ✓');
    } catch (err) {
      setError(err?.code?.includes('requires-recent-login')
        ? 'Por seguridad, cierra sesión y vuelve a entrar para cambiarla.'
        : 'No se pudo actualizar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  function elegirFoto() {
    if (subiendo) return;
    vibrate();
    fileRef.current?.click();
  }

  async function onFotoSeleccionada(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-elegir el mismo archivo
    if (!file) return;
    setSubiendo(true);
    try {
      const url = await subirAvatar(reto.id, usuario.id, file);
      setFoto(url);
      refrescarUsuario?.({ photoURL: url });
      vibrate([30, 40, 30]);
      toast('Foto de perfil actualizada ✓');
    } catch {
      toast('No se pudo subir la foto. Intenta otra.', true);
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarFoto() {
    setModalQuitarFoto(false);
    setSubiendo(true);
    try {
      await borrarAvatar(reto.id, usuario.id);
      setFoto(null);
      refrescarUsuario?.({ photoURL: null });
      toast('Foto eliminada');
    } catch {
      toast('No se pudo quitar la foto.', true);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <section className="profile-hero">
        <button
          type="button"
          className="profile-av-btn"
          onClick={elegirFoto}
          aria-label="Cambiar foto de perfil"
        >
          <Avatar nombre={usuario.nombre} url={foto} className="profile-av" />
          <span className="profile-av-edit">{subiendo ? '…' : '📷'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFotoSeleccionada}
        />
        <h1 className="profile-name">{usuario.nombre}</h1>
        <div className="profile-reto">{reto.nombre} · {reto.subtitulo}</div>
        <div className="profile-badges">
          <span className="pbadge">🔥 Racha <b>{racha}</b></span>
          <span className="pbadge">💪 Días <b>{totalDias}</b></span>
          {vacaciones !== null && (
            <span className="pbadge">🌴 Vacaciones <b>{reto.limites.Vacaciones.max - vacaciones}</b> disp.</span>
          )}
          {periodo !== null && (
            <span className="pbadge">🌸 Periodo <b>{reto.limites['Periodo Menstrual'].max - periodo}</b> este mes</span>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Tu reto</h2></div>
        <button className="pref-row" type="button" onClick={() => { vibrate(); setReglas(true); }}>
          <span className="pr-icon">📖</span>
          <span className="pr-text">
            Reglamento del reto
            <span className="pr-sub">Tiempos, evidencias, multas, premios y más</span>
          </span>
        </button>
        <button className="pref-row" type="button" style={{ cursor: 'default' }}>
          <span className="pr-icon">🎯</span>
          <span className="pr-text">
            Meta semanal
            <span className="pr-sub">{reto.metaDiasSemana} días de lunes a domingo · bonus al {reto.diaBonus}º día</span>
          </span>
        </button>
        <button className="pref-row" type="button" style={{ cursor: 'default' }}>
          <span className="pr-icon">💸</span>
          <span className="pr-text">
            Multa semanal
            <span className="pr-sub">${reto.multaSemanal}.00 MXN si no cumples la meta</span>
          </span>
        </button>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Cuenta</h2></div>
        <button className="pref-row" type="button" onClick={elegirFoto} disabled={subiendo}>
          <span className="pr-icon">📷</span>
          <span className="pr-text">
            {foto ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
            <span className="pr-sub">{subiendo ? 'Procesando imagen…' : 'También puedes tocar tu avatar'}</span>
          </span>
        </button>
        {foto && (
          <button className="pref-row" type="button" onClick={() => { vibrate(); setModalQuitarFoto(true); }} disabled={subiendo}>
            <span className="pr-icon">🗑️</span>
            <span className="pr-text">
              Quitar foto
              <span className="pr-sub">Vuelve a mostrar tus iniciales</span>
            </span>
          </button>
        )}
        {pushOk && (
          <button className="pref-row" type="button" onClick={togglePush} disabled={pushCargando}>
            <span className="pr-icon">{pushActivo ? '🔔' : '🔕'}</span>
            <span className="pr-text">
              Notificaciones push
              <span className="pr-sub">
                {pushCargando ? 'Configurando…' : pushActivo
                  ? 'Activadas — te avisamos si vas atrasado en la semana'
                  : 'Recibe recordatorios para no multar'}
              </span>
            </span>
            <span className={`honor-switch ${pushActivo ? 'push-on' : ''}`} style={{ pointerEvents: 'none' }} />
          </button>
        )}
        <button className="pref-row" type="button" onClick={() => { vibrate(); setModalPass(true); setError(''); }}>
          <span className="pr-icon">🔑</span>
          <span className="pr-text">
            Cambiar contraseña
            <span className="pr-sub">Protege tu perfil del reto</span>
          </span>
        </button>
        <button className="pref-row danger" type="button" onClick={() => { vibrate(); setModalSalir(true); }}>
          <span className="pr-icon">👋</span>
          <span className="pr-text">
            Cerrar sesión
            <span className="pr-sub">Tu progreso queda guardado en la nube</span>
          </span>
        </button>
      </section>

      <ReglasSheet reto={reto} abierto={reglas} onClose={() => setReglas(false)} />

      {/* Modal cambiar contraseña */}
      <div className={`modal-overlay ${modalPass ? 'show' : ''}`}>
        <div className="modal">
          <h2>Nueva contraseña</h2>
          <p>La usarás la próxima vez que entres desde otro dispositivo.</p>
          <form onSubmit={guardarPassword}>
            <div className="field">
              <input type="password" placeholder="Nueva contraseña" value={pass1} onChange={(e) => setPass1(e.target.value)} />
            </div>
            <div className="field">
              <input type="password" placeholder="Confírmala" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            </div>
            <p className="error-text">{error}</p>
            <button className="btn-dark" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
            <button className="btn-secondary" type="button" onClick={() => setModalPass(false)}>Cancelar</button>
          </form>
        </div>
      </div>

      {/* Modal quitar foto */}
      <div className={`modal-overlay ${modalQuitarFoto ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Quitar tu foto?</h2>
          <p>Volverás a mostrar tus iniciales. Puedes añadir otra cuando quieras.</p>
          <button className="btn-dark" type="button" onClick={quitarFoto}>Sí, quitar foto</button>
          <button className="btn-secondary" type="button" onClick={() => setModalQuitarFoto(false)}>Cancelar</button>
        </div>
      </div>

      {/* Modal cerrar sesión */}
      <div className={`modal-overlay ${modalSalir ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Cerrar sesión?</h2>
          <p>Necesitarás tu contraseña para volver a entrar.</p>
          <button className="btn-dark" type="button" onClick={cerrarSesion}>Sí, cerrar sesión</button>
          <button className="btn-secondary" type="button" onClick={() => setModalSalir(false)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
