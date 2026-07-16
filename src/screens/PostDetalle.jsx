/**
 * Pantalla de una publicación — cada post tiene su propia URL compartible:
 *   #/post/{retoId}/{postId}
 *
 * El contenido protagonista depende del tipo de publicación:
 *   foto → la imagen en grande · registro → tarjeta de actividad en héroe ·
 *   solo texto → tipografía display en grande.
 *
 * Con sesión de participante (del mismo reto) es interactiva: reacciones y
 * comentarios abiertos de entrada. Sin sesión (link compartido) es una vista
 * de solo lectura: la publicación con su fecha, el conteo de reacciones y
 * una invitación a entrar al reto — la app entra como anónimo a Firebase,
 * suficiente para leer.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar } from '../components/ui';
import Comentarios from '../components/Comentarios';
import Lightbox from '../components/Lightbox';
import { suscribirPost, reaccionarPost, obtenerUsuariosActivos } from '../data/queries';
import { getReto } from '../config/retos';
import { punch, particulasEmoji } from '../lib/anim';
import { auth } from '../firebase';

const EMOJIS = ['💪', '🔥', '👏', '😮', '❤️'];

function fechaCompleta(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  const fecha = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

export default function PostDetalle() {
  const { retoId, postId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { reto: retoSesion, usuario } = useAuth();

  const retoURL = getReto(retoId);
  // Interactivo solo para participantes del MISMO reto de la publicación
  const esParticipante = Boolean(usuario?.id && usuario.id !== '__admin__' && retoSesion?.id === retoId);

  const [listo, setListo] = useState(Boolean(auth.currentUser)); // auth lista (anónima o real)
  const [post, setPost] = useState(undefined); // undefined = cargando, null = no existe
  const [usuarios, setUsuarios] = useState([]);
  const [fotoAbierta, setFotoAbierta] = useState(null);

  // Espera a que Firebase tenga sesión (la anónima entra sola al abrir la app)
  useEffect(() => onAuthStateChanged(auth, (u) => setListo(Boolean(u))), []);

  // Tema visual del reto de la publicación; al salir se restaura el de la sesión
  useEffect(() => {
    const previo = document.body.dataset.reto;
    if (retoURL) document.body.dataset.reto = retoURL.id;
    return () => { document.body.dataset.reto = previo || ''; };
  }, [retoURL]);

  // La publicación, en vivo (reacciones y comentarios al momento)
  useEffect(() => {
    if (!listo || !retoURL) return undefined;
    return suscribirPost(retoId, postId, setPost, () => setPost(null));
  }, [listo, retoURL, retoId, postId]);

  // Roster del reto: avatares del autor y los comentarios + @menciones
  useEffect(() => {
    if (!listo || !retoURL) return;
    obtenerUsuariosActivos(retoId).then(setUsuarios).catch(() => {});
  }, [listo, retoURL, retoId]);

  const fotos = useMemo(
    () => Object.fromEntries(usuarios.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])),
    [usuarios],
  );

  const miUid = auth.currentUser?.uid;
  const miReaccion = (esParticipante && post?.reacciones?.[miUid]) || null;
  const conteos = useMemo(() => {
    const c = {};
    Object.values(post?.reacciones || {}).forEach((e) => { c[e] = (c[e] || 0) + 1; });
    return c;
  }, [post?.reacciones]);

  async function reaccionar(emoji, el) {
    if (!esParticipante) return;
    vibrate(18);
    if (el) punch(el, 1.35);
    if (el && miReaccion !== emoji) particulasEmoji(el, emoji);
    try {
      await reaccionarPost(retoId, post, usuario, miReaccion === emoji ? null : emoji);
    } catch {
      toast('No se pudo reaccionar.', true);
    }
  }

  async function compartir() {
    vibrate(15);
    // URL limpia /p/... : la función `ogpost` le da a WhatsApp/redes una
    // vista previa con la miniatura de la foto y el texto, y redirige a la app
    const url = `${window.location.origin}/p/${retoId}/${postId}`;
    const titulo = post?.texto
      ? `“${post.texto.slice(0, 120)}${post.texto.length > 120 ? '…' : ''}” — ${post.nombre}`
      : `Publicación de ${post?.nombre || 'el equipo'} en ${retoURL.nombre}`;
    try {
      if (navigator.share) await navigator.share({ title: titulo, text: titulo, url });
      else { await navigator.clipboard.writeText(url); toast('Enlace copiado 📋'); }
    } catch { /* compartir cancelado */ }
  }

  function volver() {
    vibrate(12);
    if (esParticipante) {
      if (window.history.length > 1) navigate(-1);
      else navigate('/feed');
    } else navigate('/');
  }

  // ——— Estados de carga / error
  if (!retoURL) {
    return (
      <div className="app-shell pd-shell">
        <div className="pd-novale">
          <span className="noti-vacio-icon">🤔</span>
          <h2>Enlace no válido</h2>
          <p>Este enlace no corresponde a ningún reto.</p>
          <button className="btn-dark" type="button" onClick={() => navigate('/')}>Ir al inicio</button>
        </div>
      </div>
    );
  }

  const esRegistro = post?.tipoPost === 'registro' && post?.actividad;
  const iconoActividad = esRegistro
    ? (retoURL.actividades.find((a) => a.id === post.actividad.tipo)?.icono || '💪')
    : null;
  const totalReacciones = Object.keys(post?.reacciones || {}).length;

  return (
    <div className="app-shell pd-shell">
      {/* Barra superior: volver / marca + compartir */}
      <header className="pd-top">
        <button className="pd-volver" type="button" aria-label={esParticipante ? 'Volver' : 'Ir al inicio'} onClick={volver}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="pd-marca">
          <b>{retoURL.nombre}</b>
          <span>Publicación del equipo</span>
        </div>
        {post && (
          <button className="pd-compartir" type="button" aria-label="Compartir publicación" onClick={compartir}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
          </button>
        )}
      </header>

      {post === undefined && (
        <section className="card"><div className="rank-empty">Cargando publicación…</div></section>
      )}

      {post === null && (
        <div className="pd-novale">
          <span className="noti-vacio-icon">🗑️</span>
          <h2>Ya no está aquí</h2>
          <p>Esta publicación fue eliminada o el enlace no es correcto.</p>
          <button className="btn-dark" type="button" onClick={volver}>{esParticipante ? 'Volver al feed' : 'Ir al inicio'}</button>
        </div>
      )}

      {post && (
        <article className="pd stagger">
          {/* Autor + fecha completa */}
          <div className="pd-autor">
            <Avatar nombre={post.nombre} url={fotos[post.usuarioId]} className="pd-autor-av" ampliable />
            <div className="pd-autor-info">
              <b>{post.nombre}</b>
              <span>{fechaCompleta(post.creadoEn) || 'Justo ahora'}</span>
            </div>
          </div>

          {/* ——— Protagonista según el tipo ——— */}
          {post.fotoURL && (
            <button
              type="button"
              className="pd-hero-foto"
              aria-label="Ver foto a pantalla completa"
              onClick={() => { vibrate(12); setFotoAbierta({ url: post.fotoURL, nombre: post.nombre, texto: post.texto }); }}
            >
              <img src={post.fotoURL} alt="" />
            </button>
          )}

          {esRegistro && (
            <div className={`pd-hero-actividad ${post.fotoURL ? 'compacta' : ''}`}>
              <span className="pd-ha-icon">{iconoActividad}</span>
              <div className="pd-ha-tipo">{post.actividad.tipo}</div>
              <div className="pd-ha-chips">
                {post.actividad.minutos > 0 && <span className="pd-ha-chip"><b>{post.actividad.minutos}</b> min</span>}
                {post.actividad.calorias > 0 && <span className="pd-ha-chip"><b>{post.actividad.calorias}</b> kcal</span>}
                {(post.actividad.racha || 0) > 1 && <span className="pd-ha-chip racha">🔥 <b>{post.actividad.racha}</b> días</span>}
                {post.actividad.estatus === 'JUSTIFICADO' && <span className="pd-ha-chip">Justificado</span>}
              </div>
            </div>
          )}

          {post.texto && (
            <p className={`pd-texto ${!post.fotoURL && !esRegistro ? 'hero' : ''}`}>{post.texto}</p>
          )}

          {/* ——— Reacciones ——— */}
          {esParticipante ? (
            <div className="post-reactions pd-reacciones">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`reaction-chip grande ${miReaccion === e ? 'mine' : ''} ${conteos[e] ? 'has' : ''}`}
                  onClick={(ev) => reaccionar(e, ev.currentTarget)}
                >
                  {e}{conteos[e] ? <b>{conteos[e]}</b> : null}
                </button>
              ))}
            </div>
          ) : (
            totalReacciones > 0 && (
              <div className="post-reactions pd-reacciones solo-lectura" aria-label={`${totalReacciones} reacciones`}>
                {EMOJIS.filter((e) => conteos[e]).map((e) => (
                  <span key={e} className="reaction-chip grande has">{e}<b>{conteos[e]}</b></span>
                ))}
              </div>
            )
          )}

          {/* ——— Comentarios (participante) o invitación (visitante) ——— */}
          {esParticipante ? (
            <Comentarios reto={retoURL} post={post} usuario={usuario} fotos={fotos} usuarios={usuarios} />
          ) : (
            <div className="pd-cta-anon">
              <span className="pd-cta-icon">🔒</span>
              <div>
                <b>¿Eres parte del reto?</b>
                <p>
                  Entra con tu perfil para reaccionar y comentar
                  {post.numComentarios > 0 ? ` — hay ${post.numComentarios} comentario${post.numComentarios !== 1 ? 's' : ''} esperándote` : ''}.
                </p>
              </div>
              <button className="btn-dark" type="button" onClick={() => { vibrate(15); navigate('/'); }}>Entrar</button>
            </div>
          )}
        </article>
      )}

      <Lightbox foto={fotoAbierta} onClose={() => setFotoAbierta(null)} />
    </div>
  );
}
