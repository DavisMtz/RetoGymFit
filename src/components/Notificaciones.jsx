/**
 * Centro de notificaciones in-app.
 *
 * La campanita del header muestra un punto con el número de pendientes:
 * todo lo ocurrido DESPUÉS de tu última consulta (`notifVistoEn` en tu doc
 * de usuario). Al abrir la bandeja, lo pendiente se observa y pasa a
 * "leído" (la marca se actualiza); las leídas viejas se podan solas.
 *
 * Fuentes de noticias:
 *  - `notificaciones` dirigidas a ti: reacciones y comentarios en TUS
 *    publicaciones, @menciones y high-fives 🖐️ (en vivo, onSnapshot).
 *  - Publicaciones y registros nuevos de los DEMÁS, derivados del propio
 *    feed (sin escrituras extra).
 *
 * Tocar una notificación navega a su destino: la publicación exacta en el
 * feed (se resalta) o el ranking en el caso de los high-fives.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vibrate, Avatar } from './ui';
import {
  suscribirNotificaciones, suscribirPosts, marcarNotificacionesVistas,
  podarNotificacionesLeidas, obtenerUsuariosActivos,
} from '../data/queries';

function hace(ms) {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return `hace ${Math.round(mins / 1440)} d`;
}

const tsMs = (ts) => {
  if (ts?.toDate) return ts.toDate().getTime(); // Timestamp de Firestore
  if (ts instanceof Date) return ts.getTime();  // marca local tras consultar
  return ts ? Number(ts) || Date.now() : Date.now();
};

/** Cuántos días de novedades del feed se consideran "noticia" */
const VENTANA_FEED_MS = 3 * 86400000;

function construirItems(notifs, posts, miUsuarioId) {
  const items = [];
  (notifs || []).forEach((n) => {
    const t = tsMs(n.creadoEn);
    let icono = '🔔'; let accion = ''; let detalle = '';
    if (n.tipo === 'reaccion') {
      icono = n.detalle || '👏';
      accion = 'reaccionó a tu publicación';
      detalle = n.postTexto ? `“${n.postTexto}”` : '';
    } else if (n.tipo === 'comentario') {
      icono = '💬';
      accion = 'comentó tu publicación';
      detalle = n.detalle ? `“${n.detalle}”` : '';
    } else if (n.tipo === 'mencion') {
      icono = '📣';
      accion = 'te mencionó en un comentario';
      detalle = n.detalle ? `“${n.detalle}”` : '';
    } else if (n.tipo === 'highfive') {
      icono = '🖐️';
      accion = 'te chocó los cinco';
      detalle = '¡Tu esfuerzo se nota!';
    }
    items.push({
      id: `n-${n.id}`,
      icono,
      quien: n.deNombre,
      quienUsuarioId: n.deUsuarioId,
      accion,
      detalle,
      t,
      destino: n.tipo === 'highfive' ? { ruta: '/ranking' } : { ruta: '/feed', postId: n.postId || null },
    });
  });
  // Novedades del feed: lo que publicaron/registraron los demás hace poco
  const desde = Date.now() - VENTANA_FEED_MS;
  (posts || []).forEach((p) => {
    if (p.usuarioId === miUsuarioId) return;
    const t = tsMs(p.creadoEn);
    if (t < desde) return;
    const esRegistro = p.tipoPost === 'registro' && p.actividad;
    items.push({
      id: `p-${p.id}`,
      icono: esRegistro ? '🏋️' : p.fotoURL ? '📸' : '✍️',
      quien: p.nombre,
      quienUsuarioId: p.usuarioId,
      accion: esRegistro ? 'registró su actividad' : 'publicó en el feed',
      detalle: p.texto ? `“${p.texto.slice(0, 80)}${p.texto.length > 80 ? '…' : ''}”`
        : esRegistro ? `${p.actividad.tipo}${p.actividad.calorias > 0 ? ` · ${p.actividad.calorias} kcal` : ''}`
          : 'Subió una foto — échale un ojo.',
      t,
      destino: { ruta: '/feed', postId: p.id },
    });
  });
  items.sort((a, b) => b.t - a.t);
  return items;
}

export default function NotiCampana() {
  const { reto, usuario, refrescarUsuario } = useAuth();
  const navigate = useNavigate();

  const [abierto, setAbierto] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [posts, setPosts] = useState([]);
  const [fotos, setFotos] = useState({}); // usuarioId → photoURL
  // Última consulta consciente de la bandeja (ms). Gobierna el punto de
  // pendientes; `corte` congela su valor al abrir para que lo nuevo se vea
  // como nuevo mientras la hoja está abierta. Sin marca previa → todo lo
  // reciente está pendiente.
  const [vistoEn, setVistoEn] = useState(() => (usuario?.notifVistoEn ? tsMs(usuario.notifVistoEn) : 0));
  const corteRef = useRef(vistoEn);

  // Suscripciones en vivo: bandeja dirigida + novedades del feed
  useEffect(() => {
    if (!reto || !usuario?.id) return undefined;
    const u1 = suscribirNotificaciones(reto.id, setNotifs, () => {});
    const u2 = suscribirPosts(reto.id, setPosts, () => {}, 15);
    return () => { u1(); u2(); };
  }, [reto, usuario?.id]);

  // Avatares de quienes aparecen en la bandeja (solo al abrirla)
  useEffect(() => {
    if (!abierto || !reto) return;
    obtenerUsuariosActivos(reto.id)
      .then((us) => setFotos(Object.fromEntries(us.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL]))))
      .catch(() => {});
  }, [abierto, reto]);

  // Bloquea el scroll del fondo mientras la hoja está abierta
  useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [abierto]);

  const items = useMemo(
    () => construirItems(notifs, posts, usuario?.id),
    [notifs, posts, usuario?.id],
  );
  const pendientes = useMemo(
    () => items.filter((i) => i.t > vistoEn).length,
    [items, vistoEn],
  );

  function abrir() {
    vibrate(15);
    corteRef.current = vistoEn; // congela el estado leído/nuevo de esta consulta
    setAbierto(true);
    // Observar la bandeja la marca como vista: el punto se apaga y lo de hoy
    // quedará como "leído" en la próxima consulta. También poda lo viejo.
    if (usuario?.id) {
      marcarNotificacionesVistas(reto.id, usuario.id);
      podarNotificacionesLeidas(reto.id, notifs, vistoEn);
    }
    const ahora = new Date();
    setVistoEn(ahora.getTime());
    // Refleja la marca en el contexto: la campanita se monta de nuevo en cada
    // pantalla y debe recordar que esta consulta ya ocurrió.
    refrescarUsuario({ notifVistoEn: ahora });
  }

  function ir(item) {
    vibrate(12);
    setAbierto(false);
    // Las publicaciones viven en su propia pantalla; el high-five, en el ranking
    if (item.destino.postId) navigate(`/post/${reto.id}/${item.destino.postId}`);
    else navigate(item.destino.ruta);
  }

  if (!usuario?.id || usuario.id === '__admin__') return null;

  return (
    <>
      <button className="noti-btn" type="button" aria-label={`Notificaciones${pendientes ? ` — ${pendientes} pendientes` : ''}`} onClick={abrir}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {pendientes > 0 && <span className="noti-dot">{pendientes > 9 ? '9+' : pendientes}</span>}
      </button>

      {createPortal(
        <div className={`sheet-overlay ${abierto ? 'show' : ''}`} onClick={() => setAbierto(false)}>
          <div className="sheet noti-sheet" role="dialog" aria-modal="true" aria-label="Notificaciones" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <header className="sheet-head">
              <div>
                <div className="sheet-eyebrow">Tu equipo se mueve</div>
                <h2 className="sheet-title">Notificaciones</h2>
              </div>
              <button className="sheet-close" type="button" aria-label="Cerrar" onClick={() => { vibrate(10); setAbierto(false); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="sheet-body">
              {abierto && items.length === 0 && (
                <div className="noti-vacio">
                  <span className="noti-vacio-icon">🔕</span>
                  Sin novedades por ahora.<br />Cuando tu equipo se mueva, lo verás aquí.
                </div>
              )}
              {abierto && items.map((item, i) => {
                const nueva = item.t > corteRef.current;
                return (
                  <button
                    className={`noti-row ${nueva ? 'nueva' : ''}`}
                    type="button"
                    key={item.id}
                    style={{ animationDelay: `${Math.min(i * 0.045, 0.45)}s` }}
                    onClick={() => ir(item)}
                  >
                    <span className="noti-av-wrap">
                      <Avatar nombre={item.quien} url={fotos[item.quienUsuarioId]} className="noti-av" />
                      <span className="noti-icono">{item.icono}</span>
                    </span>
                    <span className="noti-body">
                      <span className="noti-texto"><b>{item.quien.split(' ').slice(0, 2).join(' ')}</b> {item.accion}</span>
                      {item.detalle && <span className="noti-detalle">{item.detalle}</span>}
                      <span className="noti-hace">{hace(item.t)}{nueva ? ' · nuevo' : ''}</span>
                    </span>
                    {nueva && <span className="noti-punto" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
