/**
 * Perfil: identidad del atleta, días justificados disponibles,
 * cambio de contraseña y cierre de sesión.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, getInitials, Header, StatusStrip } from '../components/ui';
import { obtenerHistorial, contarPorTipo } from '../data/queries';
import { comprimirFoto } from '../lib/imagen';
import { calcularRacha } from '../lib/dates';

export default function Perfil() {
  const { reto, usuario, cerrarSesion, cambiarPassword, actualizarFoto } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [modalQuitarFoto, setModalQuitarFoto] = useState(false);
  const [racha, setRacha] = useState(0);
  const [totalDias, setTotalDias] = useState(0);
  const [vacaciones, setVacaciones] = useState(null);
  const [periodo, setPeriodo] = useState(null);
  const [modalPass, setModalPass] = useState(false);
  const [modalSalir, setModalSalir] = useState(false);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

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
    if (subiendoFoto) return;
    vibrate();
    fileRef.current?.click();
  }

  async function onFotoSeleccionada(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-elegir el mismo archivo
    if (!file) return;
    setSubiendoFoto(true);
    try {
      const dataUrl = await comprimirFoto(file);
      await actualizarFoto(dataUrl);
      vibrate([30, 40, 30]);
      toast('Foto de perfil actualizada ✓');
    } catch (err) {
      toast(err?.message || 'No se pudo actualizar la foto.', true);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function quitarFoto() {
    setModalQuitarFoto(false);
    setSubiendoFoto(true);
    try {
      await actualizarFoto(null);
      toast('Foto eliminada');
    } catch {
      toast('No se pudo quitar la foto.', true);
    } finally {
      setSubiendoFoto(false);
    }
  }

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <section className="profile-hero">
        <button
          type="button"
          className={`profile-av${usuario.fotoPerfil ? ' has-photo' : ''}`}
          onClick={elegirFoto}
          disabled={subiendoFoto}
          aria-label={usuario.fotoPerfil ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
        >
          {usuario.fotoPerfil
            ? <img src={usuario.fotoPerfil} alt={usuario.nombre} />
            : <span>{getInitials(usuario.nombre)}</span>}
          <span className="profile-av-cam" aria-hidden="true">
            {subiendoFoto ? <span className="av-spinner" /> : '📷'}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
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
        <button className="pref-row" type="button" onClick={elegirFoto} disabled={subiendoFoto}>
          <span className="pr-icon">📷</span>
          <span className="pr-text">
            {usuario.fotoPerfil ? 'Cambiar foto de perfil' : 'Añadir foto de perfil'}
            <span className="pr-sub">{subiendoFoto ? 'Procesando imagen…' : 'También puedes tocar tu avatar'}</span>
          </span>
        </button>
        {usuario.fotoPerfil && (
          <button className="pref-row" type="button" onClick={() => { vibrate(); setModalQuitarFoto(true); }} disabled={subiendoFoto}>
            <span className="pr-icon">🗑️</span>
            <span className="pr-text">
              Quitar foto
              <span className="pr-sub">Vuelve a mostrar tus iniciales</span>
            </span>
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
