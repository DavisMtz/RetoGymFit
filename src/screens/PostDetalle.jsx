/**
 * Pantalla de una publicación — cada post tiene su propia URL compartible:
 *   #/post/{retoId}/{postId}   (y /p/{retoId}/{postId} para las redes)
 *
 * El contenido protagonista depende del tipo de publicación:
 *   foto → imagen a sangre con degradado · registro → tarjeta héroe de la
 *   actividad · solo texto → tipografía display en grande.
 *
 * Con sesión de participante (del mismo reto) es interactiva: reacciones con
 * partículas y comentarios EN VIVO con formulario. Sin sesión (link
 * compartido) es de solo lectura: publicación con fecha, quiénes reaccionaron
 * y los comentarios visibles, con invitación a entrar al reto — la app entra
 * como anónimo a Firebase, suficiente para leer.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar } from '../components/ui';
import Comentarios, { hace } from '../components/Comentarios';
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
  // authUid → primer nombre, para contar quiénes reaccionaron
  const nombrePorUid = useMemo(
    () => Object.fromEntries(usuarios.filter((u) => u.authUid).map((u) => [u.authUid, u.nombre.split(' ')[0]])),
    [usuarios],
  );

  const miUid = auth.currentUser?.uid;
  const miReaccion = (esParticipante && post?.reacciones?.[miUid]) || null;
  const conteos = useMemo(() => {
    const c = {};
    Object.values(post?.reacciones || {}).forEach((e) => { c[e] = (c[e] || 0) + 1; });
    return c;
  }, [post?.reacciones]);
  const totalReacciones = Object.keys(post?.reacciones || {}).length;

  // "Les late a Ana, Beto y 3 más" — quiénes reaccionaron, con nombre
  const quienesReaccionan = useMemo(() => {
    const uids = Object.keys(post?.reacciones || {});
    if (!uids.length) return '';
    const nombres = [];
    uids.forEach((uid) => {
      if (uid === miUid && esParticipante) nombres.unshift('ti');
      else if (nombrePorUid[uid]) nombres.push(nombrePorUid[uid]);
    });
    const resto = uids.length - nombres.length;
    const visibles = nombres.slice(0, 2);
    const extra = resto + (nombres.length - visibles.length);
    if (!visibles.length) return `${uids.length} del equipo reaccionaron`;
    let frase = `Le late a ${visibles.join(' y a ')}`;
    if (extra > 0) frase += ` y ${extra} más`;
    return frase;
  }, [post?.reacciones, nombrePorUid, miUid, esParticipante]);

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
    if (window.history.length > 1) navigate(-1);
    else navigate('/feed');
  }

  // ——— Estados de carga / error
  if (!retoURL) {
    return (
      <div className="app-shell pd-shell">
        <div className="pd-novale">
          <span className="noti-vacio-icon">🤔</span>
          <h2>Enlace no válido</h2>
          <p>Este enlace no corresponde a ninguna publicación del reto.</p>
          {esParticipante && <button className="btn-dark" type="button" onClick={() => navigate('/')}>Ir al inicio</button>}
        </div>
      </div>
    );
  }

  const esRegistro = post?.tipoPost === 'registro' && post?.actividad;
  const iconoActividad = esRegistro
    ? (retoURL.actividades.find((a) => a.id === post.actividad.tipo)?.icono || '💪')
    : null;
  const numComentarios = post?.numComentarios || 0;

  return (
    <div className="app-shell pd-shell">
      {/* Barra superior flotante: volver (solo participantes) / marca + compartir.
          Para un visitante externo NO hay puertas hacia el onboarding: la
          pantalla es una vitrina de solo lectura. */}
      <header className="pd-top">
        {esParticipante && (
          <button className="pd-volver" type="button" aria-label="Volver" onClick={volver}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
        )}
        {!esParticipante && <span className="pd-marca-mini pd-marca-logo">{retoURL.marca}</span>}
        <div className="pd-marca">
          <b>{retoURL.nombre}</b>
          <span>{esParticipante ? 'Publicación del equipo' : 'Comunidad privada'}</span>
        </div>
        {post && (
          <button className="pd-compartir" type="button" aria-label="Compartir publicación" onClick={compartir}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
          </button>
        )}
      </header>

      {post === undefined && (
        <div className="pd pd-entrada">
          <div className="pd-cargando">
            <div className="sk sk-av" style={{ width: 46, height: 46 }} />
            <div style={{ flex: 1 }}>
              <div className="sk sk-text" style={{ maxWidth: 150 }} />
              <div className="sk sk-text" style={{ maxWidth: 100, height: 9, marginTop: 7 }} />
            </div>
          </div>
          <div className="sk sk-foto" style={{ marginTop: 16 }} />
        </div>
      )}

      {post === null && (
        <div className="pd-novale">
          <span className="noti-vacio-icon">🗑️</span>
          <h2>Ya no está aquí</h2>
          <p>Esta publicación fue eliminada o el enlace no es correcto.</p>
          {esParticipante && <button className="btn-dark" type="button" onClick={volver}>Volver al feed</button>}
        </div>
      )}

      {post && (
        <article className="pd pd-entrada">
          {/* Autor + fecha completa */}
          <div className="pd-autor">
            <Avatar nombre={post.nombre} url={fotos[post.usuarioId]} className="pd-autor-av" ampliable />
            <div className="pd-autor-info">
              <b>{post.nombre}</b>
              <span>{esRegistro ? 'registró su actividad' : 'compartió con el equipo'} · {hace(post.creadoEn)}</span>
            </div>
            <span className="pd-marca-mini">{retoURL.marca}</span>
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
              <span className="pd-hero-velo" aria-hidden="true" />
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

          <div className="pd-fecha">{fechaCompleta(post.creadoEn) || 'Justo ahora'}</div>

          {/* ——— Pulso social: quiénes reaccionaron + conteos ——— */}
          {(totalReacciones > 0 || numComentarios > 0) && (
            <div className="pd-pulso">
              {quienesReaccionan && <span className="pd-pulso-nombres">{quienesReaccionan}</span>}
              <span className="pd-pulso-stats">
                {totalReacciones > 0 && <>{totalReacciones} reacci{totalReacciones === 1 ? 'ón' : 'ones'}</>}
                {totalReacciones > 0 && numComentarios > 0 && ' · '}
                {numComentarios > 0 && <>{numComentarios} comentario{numComentarios === 1 ? '' : 's'}</>}
              </span>
            </div>
          )}

          {/* ——— Reacciones ——— */}
          <div className={`post-reactions pd-reacciones ${esParticipante ? '' : 'solo-lectura'}`}>
            {EMOJIS.map((e) => {
              if (!esParticipante && !conteos[e]) return null;
              return esParticipante ? (
                <button
                  key={e}
                  type="button"
                  className={`reaction-chip grande ${miReaccion === e ? 'mine' : ''} ${conteos[e] ? 'has' : ''}`}
                  onClick={(ev) => reaccionar(e, ev.currentTarget)}
                >
                  {e}{conteos[e] ? <b>{conteos[e]}</b> : null}
                </button>
              ) : (
                <span key={e} className="reaction-chip grande has">{e}<b>{conteos[e]}</b></span>
              );
            })}
            {!esParticipante && totalReacciones === 0 && (
              <span className="pd-sin-reacciones">Nadie ha reaccionado aún</span>
            )}
          </div>

          {/* ——— Sello de exclusividad para visitantes: pueden VER, pero el
              acceso es solo del equipo (sin puertas al onboarding) ——— */}
          {!esParticipante && (
            <div className="pd-privado">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 118 0v4" /></svg>
              <span>Comunidad privada del reto — solo el equipo puede reaccionar y comentar.</span>
            </div>
          )}

          {/* ——— Comentarios: visibles para todos, en vivo; opinar es de participantes ——— */}
          <div className="pd-comentarios-head">
            <b>Comentarios</b>
            {numComentarios > 0 && <span>{numComentarios}</span>}
          </div>
          <Comentarios
            reto={retoURL}
            post={post}
            usuario={usuario}
            fotos={fotos}
            usuarios={usuarios}
            puedeComentar={esParticipante}
          />
        </article>
      )}

      <Lightbox foto={fotoAbierta} onClose={() => setFotoAbierta(null)} />
    </div>
  );
}
