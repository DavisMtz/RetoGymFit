/**
 * Feed social del reto: publica pensamientos o fotos fitness, reacciona con
 * emojis (con partículas 🎉) y comenta con @menciones. Los registros de
 * actividad aparecen como tarjetas automáticas. Se actualiza en vivo
 * (onSnapshot) para que se sienta como una red social del equipo.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useToast, vibrate, Avatar, AvatarRing, Header, StatusStrip,
  PostSkeleton, usePullToRefresh, PullIndicator,
} from '../components/ui';
import {
  suscribirPosts, publicarPost, borrarPost, reaccionarPost,
  obtenerComentarios, comentarPost, borrarComentario, obtenerUsuariosActivos,
  obtenerRankingSemanal, notificarMenciones,
} from '../data/queries';
import { subirFotoFeed } from '../lib/feedFoto';
import { abrirLightbox, punch, particulasEmoji } from '../lib/anim';
import { auth } from '../firebase';

const EMOJIS = ['💪', '🔥', '👏', '😮', '❤️'];

function hace(ts) {
  if (!ts?.toDate) return 'ahora';
  const mins = Math.max(0, Math.round((Date.now() - ts.toDate().getTime()) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return `hace ${Math.round(mins / 1440)} d`;
}

// ——— Menciones @nombre ———————————————————————————————
// Pliegue que PRESERVA la longitud del texto (minúsculas + sin acentos) para
// poder buscar nombres sin que los índices se desalineen al resaltar.
function fold(s) {
  return String(s).toLowerCase()
    .replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n');
}

/** Usuarios mencionados en el texto: por nombre completo o primer nombre (si es único). */
function detectarMencionados(texto, usuarios) {
  const t = fold(texto);
  if (!t.includes('@')) return [];
  const cuentaPrimero = {};
  usuarios.forEach((u) => {
    const p = fold(u.nombre.split(' ')[0]);
    cuentaPrimero[p] = (cuentaPrimero[p] || 0) + 1;
  });
  return usuarios.filter((u) => {
    if (t.includes('@' + fold(u.nombre))) return true;
    const primero = fold(u.nombre.split(' ')[0]);
    return cuentaPrimero[primero] === 1 && t.includes('@' + primero);
  });
}

/** Renderiza el texto de un comentario resaltando las @menciones. */
function TextoConMenciones({ texto, usuarios }) {
  const partes = useMemo(() => {
    const t = fold(texto);
    const zonas = [];
    (usuarios || []).forEach((u) => {
      [u.nombre, u.nombre.split(' ')[0]].forEach((candidato) => {
        const token = '@' + fold(candidato);
        let idx = t.indexOf(token);
        while (idx !== -1) {
          zonas.push([idx, idx + token.length]);
          idx = t.indexOf(token, idx + 1);
        }
      });
    });
    if (!zonas.length) return [{ texto, mencion: false }];
    // Fusiona zonas solapadas (nombre completo vs primer nombre) y corta
    zonas.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const unidas = [];
    zonas.forEach(([a, b]) => {
      const ultima = unidas[unidas.length - 1];
      if (ultima && a <= ultima[1]) ultima[1] = Math.max(ultima[1], b);
      else unidas.push([a, b]);
    });
    const out = [];
    let cursor = 0;
    unidas.forEach(([a, b]) => {
      if (a > cursor) out.push({ texto: texto.slice(cursor, a), mencion: false });
      out.push({ texto: texto.slice(a, b), mencion: true });
      cursor = b;
    });
    if (cursor < texto.length) out.push({ texto: texto.slice(cursor), mencion: false });
    return out;
  }, [texto, usuarios]);

  return (
    <p>
      {partes.map((p, i) => (p.mencion ? <span className="mention" key={i}>{p.texto}</span> : p.texto))}
    </p>
  );
}

function Comentarios({ reto, post, usuario, fotos, usuarios }) {
  const toast = useToast();
  const [comentarios, setComentarios] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mencion, setMencion] = useState(null); // { query, start } — palabra @ bajo el cursor
  const inputRef = useRef(null);

  useEffect(() => {
    obtenerComentarios(reto.id, post.id).then(setComentarios).catch(() => setComentarios([]));
  }, [reto.id, post.id]);

  function onCambio(e) {
    const v = e.target.value;
    setTexto(v);
    const caret = e.target.selectionStart ?? v.length;
    // ¿La palabra que se está escribiendo empieza con @? → abre el autocomplete
    const m = v.slice(0, caret).match(/@([a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]*(?: [a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]*)?)$/);
    setMencion(m ? { query: m[1], start: caret - m[0].length } : null);
  }

  const sugerencias = useMemo(() => {
    if (!mencion) return [];
    const q = fold(mencion.query.trim());
    return (usuarios || [])
      .filter((u) => u.id !== usuario.id && (!q || fold(u.nombre).includes(q)))
      .slice(0, 5);
  }, [mencion, usuarios, usuario.id]);

  function elegirMencion(u) {
    vibrate(12);
    const finQuery = mencion.start + mencion.query.length + 1; // +1 por la @
    const nuevo = (texto.slice(0, mencion.start) + '@' + u.nombre + ' ' + texto.slice(finQuery)).slice(0, 300);
    setTexto(nuevo);
    setMencion(null);
    inputRef.current?.focus();
  }

  async function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setMencion(null);
    vibrate(20);
    try {
      await comentarPost(reto.id, post, usuario, t);
      // Aviso push a quienes fueron @mencionados (no bloquea)
      notificarMenciones(reto.id, post, usuario, t, detectarMencionados(t, usuarios || []));
      setTexto('');
      setComentarios(await obtenerComentarios(reto.id, post.id));
    } catch {
      toast('No se pudo comentar.', true);
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(c) {
    try {
      await borrarComentario(reto.id, post.id, c.id);
      setComentarios((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      toast('No se pudo borrar el comentario.', true);
    }
  }

  return (
    <div className="post-comments">
      {comentarios === null && <div className="post-comments-loading">Cargando comentarios…</div>}
      {(comentarios || []).map((c) => (
        <div className="comment" key={c.id}>
          <Avatar nombre={c.nombre} url={fotos[c.usuarioId]} className="comment-av" ampliable />
          <div className="comment-bubble">
            <b>{c.nombre.split(' ').slice(0, 2).join(' ')}</b>
            <TextoConMenciones texto={c.texto} usuarios={usuarios} />
            <span className="comment-meta">{hace(c.creadoEn)}</span>
          </div>
          {c.authUid === auth.currentUser?.uid && (
            <button className="comment-del" type="button" aria-label="Borrar comentario" onClick={() => { vibrate(); borrar(c); }}>✕</button>
          )}
        </div>
      ))}
      <form className="comment-form" onSubmit={enviar}>
        {mencion && sugerencias.length > 0 && (
          <div className="mencion-pop" role="listbox" aria-label="Mencionar a alguien">
            {sugerencias.map((u) => (
              <button className="mencion-item" type="button" key={u.id} role="option" aria-selected="false" onClick={() => elegirMencion(u)}>
                <Avatar nombre={u.nombre} url={u.photoURL} className="rank-av" />
                {u.nombre}
              </button>
            ))}
          </div>
        )}
        <Avatar nombre={usuario.nombre} url={usuario.photoURL} className="comment-av" />
        <input
          ref={inputRef}
          type="text"
          maxLength="300"
          placeholder="Escribe un comentario… (@ para mencionar)"
          value={texto}
          onChange={onCambio}
          onBlur={() => setTimeout(() => setMencion(null), 200)}
        />
        <button className="comment-send" type="submit" disabled={enviando || !texto.trim()} aria-label="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
        </button>
      </form>
    </div>
  );
}

/** Visor de foto a pantalla completa */
function Lightbox({ foto, onClose }) {
  const imgRef = useRef(null);
  const captionRef = useRef(null);

  // Bloquea el scroll del fondo, cierra con Escape y anima la entrada (GSAP)
  useEffect(() => {
    if (!foto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    abrirLightbox(imgRef.current, captionRef.current);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [foto, onClose]);

  // Portal al body: por encima de todo (la tabbar vive en otro stacking context)
  return createPortal(
    <div className={`lightbox ${foto ? 'show' : ''}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Foto a pantalla completa">
      {foto && (
        <>
          <img ref={imgRef} className="lightbox-img" src={foto.url} alt="" onClick={(e) => e.stopPropagation()} />
          <div ref={captionRef} className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
            <b>{foto.nombre}</b>
            {foto.texto && <p>{foto.texto}</p>}
          </div>
          <button className="lightbox-close" type="button" aria-label="Cerrar" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function Post({ reto, post, usuario, fotos, usuarios, dias, onBorrar, onVerFoto }) {
  const toast = useToast();
  const [comentariosAbiertos, setComentariosAbiertos] = useState(false);
  const miUid = auth.currentUser?.uid;
  const miReaccion = post.reacciones?.[miUid] || null;

  // Conteo por emoji a partir del mapa { authUid: emoji }
  const conteos = useMemo(() => {
    const c = {};
    Object.values(post.reacciones || {}).forEach((e) => { c[e] = (c[e] || 0) + 1; });
    return c;
  }, [post.reacciones]);

  async function reaccionar(emoji, el) {
    vibrate(18);
    if (el) punch(el, 1.35);
    // Partículas solo al PONER una reacción (no al quitarla o cambiarla)
    if (el && miReaccion !== emoji) particulasEmoji(el, emoji);
    try {
      await reaccionarPost(reto.id, post, usuario, miReaccion === emoji ? null : emoji);
      // onSnapshot refresca el post solo; no hace falta estado local
    } catch {
      toast('No se pudo reaccionar.', true);
    }
  }

  const totalComentarios = post.numComentarios || 0;
  const esRegistro = post.tipoPost === 'registro' && post.actividad;
  const iconoActividad = esRegistro
    ? (reto.actividades.find((a) => a.id === post.actividad.tipo)?.icono || '💪')
    : null;
  const metaActividad = esRegistro
    ? [
      post.actividad.minutos > 0 ? `${post.actividad.minutos} min` : null,
      post.actividad.calorias > 0 ? `${post.actividad.calorias} kcal` : null,
      post.actividad.estatus === 'JUSTIFICADO' ? 'Justificado' : null,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <article className="post">
      <header className="post-head">
        <AvatarRing
          nombre={post.nombre}
          url={fotos[post.usuarioId]}
          progreso={(dias[post.usuarioId] || 0) / reto.metaDiasSemana}
          className="post-av"
          ampliable
        />
        <div className="post-author">
          <b>{post.nombre}</b>
          <span>{esRegistro ? `registró su actividad · ${hace(post.creadoEn)}` : hace(post.creadoEn)}</span>
        </div>
        {post.authUid === miUid && (
          <button className="comment-del" type="button" aria-label="Borrar publicación" onClick={() => { vibrate(); onBorrar(post); }}>✕</button>
        )}
      </header>

      {esRegistro && (
        <div className="post-actividad">
          <span className="pa-icon">{iconoActividad}</span>
          <div className="pa-info">
            <div className="pa-tipo">{post.actividad.tipo}</div>
            {metaActividad && <div className="pa-meta">{metaActividad}</div>}
          </div>
          {(post.actividad.racha || 0) > 1 && <span className="pa-racha">🔥 {post.actividad.racha}</span>}
        </div>
      )}

      {post.texto && <p className="post-text">{post.texto}</p>}
      {post.fotoURL && (
        <button
          type="button"
          className="post-photo-wrap"
          aria-label="Ver foto a pantalla completa"
          onClick={() => { vibrate(12); onVerFoto({ url: post.fotoURL, nombre: post.nombre, texto: post.texto }); }}
        >
          <img className="post-photo" src={post.fotoURL} alt="" loading="lazy" />
        </button>
      )}

      <div className="post-actions">
        <div className="post-reactions">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`reaction-chip ${miReaccion === e ? 'mine' : ''} ${conteos[e] ? 'has' : ''}`}
              onClick={(ev) => reaccionar(e, ev.currentTarget)}
            >
              {e}{conteos[e] ? <b>{conteos[e]}</b> : null}
            </button>
          ))}
        </div>
        <button
          className={`comments-toggle ${comentariosAbiertos ? 'open' : ''}`}
          type="button"
          onClick={() => { vibrate(12); setComentariosAbiertos(!comentariosAbiertos); }}
        >
          💬 {totalComentarios > 0 ? totalComentarios : ''}
        </button>
      </div>

      {comentariosAbiertos && (
        <Comentarios reto={reto} post={post} usuario={usuario} fotos={fotos} usuarios={usuarios} />
      )}
    </article>
  );
}

export default function Feed() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const fileRef = useRef();
  const location = useLocation();
  const navigate = useNavigate();

  const [posts, setPosts] = useState(null);
  const [fotos, setFotos] = useState({});     // usuarioId → photoURL
  const [usuarios, setUsuarios] = useState([]); // activos (menciones + authUid)
  const [dias, setDias] = useState({});       // usuarioId → días de esta semana (anillo)
  const [texto, setTexto] = useState('');
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [modalBorrar, setModalBorrar] = useState(null); // post
  const [fotoAbierta, setFotoAbierta] = useState(null); // { url, nombre, texto }

  // Feed en vivo
  useEffect(() => {
    const unsub = suscribirPosts(
      reto.id,
      setPosts,
      () => { toast('Error al cargar el feed', true); setPosts([]); },
    );
    return unsub;
  }, [reto.id, toast]);

  // Avatares, lista para menciones y progreso semanal (anillos)
  const cargarGente = useCallback(async () => {
    const [us, ranking] = await Promise.all([
      obtenerUsuariosActivos(reto.id),
      obtenerRankingSemanal(reto).catch(() => []),
    ]);
    setUsuarios(us);
    setFotos(Object.fromEntries(us.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])));
    setDias(Object.fromEntries(ranking.map((r) => [r.usuarioId, r.dias])));
  }, [reto]);

  useEffect(() => { cargarGente().catch(() => {}); }, [cargarGente]);

  // Llegada desde una notificación: desplaza hasta la publicación y resáltala.
  // El state se limpia para no repetir el efecto al volver a esta pantalla.
  useEffect(() => {
    const postId = location.state?.postId;
    if (!postId || posts === null) return;
    navigate(location.pathname, { replace: true, state: null });
    // pequeño margen para que la transición de página no pelee con el scroll
    setTimeout(() => {
      const el = document.getElementById(`post-${postId}`);
      if (!el) { toast('Esa publicación ya no está en el feed reciente'); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('post-destacado');
      setTimeout(() => el.classList.remove('post-destacado'), 2600);
    }, 350);
  }, [location.state, location.pathname, posts, navigate, toast]);

  const ptr = usePullToRefresh(() => cargarGente().catch(() => {}));

  function elegirFoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  function quitarFoto() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(null);
    setFotoPreview(null);
  }

  async function publicar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t && !fotoFile) { toast('Escribe algo o añade una foto', true); return; }
    setPublicando(true);
    vibrate(30);
    try {
      let fotoURL = null;
      if (fotoFile) fotoURL = await subirFotoFeed(fotoFile);
      await publicarPost(reto.id, usuario, { texto: t, fotoURL });
      setTexto('');
      quitarFoto();
      vibrate([30, 40, 30]);
    } catch {
      toast('No se pudo publicar. Intenta de nuevo.', true);
    } finally {
      setPublicando(false);
    }
  }

  async function borrar() {
    const post = modalBorrar;
    setModalBorrar(null);
    try {
      await borrarPost(reto.id, post.id);
      toast('Publicación eliminada');
    } catch {
      toast('No se pudo eliminar.', true);
    }
  }

  return (
    <div className="app-shell">
      <PullIndicator {...ptr} />
      <Header reto={reto} />
      <StatusStrip />

      <section className="hero" style={{ padding: '24px 22px 20px' }}>
        <div className="hero-eyebrow">Comunidad</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}>El feed del <em>equipo.</em></h1>
        <p className="hero-sub">Comparte tu progreso, presume tus récords y echa porras.</p>
      </section>

      {/* Composer */}
      <section className="card composer">
        <form onSubmit={publicar}>
          <div className="composer-row">
            <Avatar nombre={usuario.nombre} url={usuario.photoURL} className="post-av" />
            <textarea
              rows="2"
              maxLength="500"
              placeholder="Comparte algo con tu equipo…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          {fotoPreview && (
            <div className="composer-preview">
              <img src={fotoPreview} alt="Vista previa" />
              <button type="button" className="comment-del preview-del" aria-label="Quitar foto" onClick={() => { vibrate(); quitarFoto(); }}>✕</button>
            </div>
          )}
          <div className="composer-actions">
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={elegirFoto} />
            <button type="button" className="admin-btn" style={{ flex: '0 0 auto' }} onClick={() => { vibrate(); fileRef.current?.click(); }}>
              📷 Foto
            </button>
            <button className="composer-publish" type="submit" disabled={publicando}>
              {publicando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      </section>

      {/* Posts */}
      {posts === null && <PostSkeleton posts={2} />}
      {posts !== null && !posts.length && (
        <div className="rank-empty">Nadie ha publicado aún. ¡Rompe el hielo con tu primera foto! 📸</div>
      )}
      {(posts || []).map((p, i) => (
        <div key={p.id} id={`post-${p.id}`} className="post-wrap" style={{ animationDelay: `${Math.min(i * 0.06, 0.4)}s` }}>
          <Post
            reto={reto}
            post={p}
            usuario={usuario}
            fotos={fotos}
            usuarios={usuarios}
            dias={dias}
            onBorrar={setModalBorrar}
            onVerFoto={setFotoAbierta}
          />
        </div>
      ))}

      <Lightbox foto={fotoAbierta} onClose={() => setFotoAbierta(null)} />

      {/* Modal borrar post */}
      <div className={`modal-overlay ${modalBorrar ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Eliminar publicación?</h2>
          <p>Se borrará para todo el equipo. Esta acción no se puede deshacer.</p>
          <button className="btn-dark" type="button" onClick={borrar}>Sí, eliminar</button>
          <button className="btn-secondary" type="button" onClick={() => setModalBorrar(null)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
