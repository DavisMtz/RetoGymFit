/**
 * Feed social del reto: publica pensamientos o fotos fitness, reacciona con
 * emojis y comenta. Se actualiza en vivo (onSnapshot) para que se sienta
 * como una red social del equipo.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar, Header, StatusStrip } from '../components/ui';
import {
  suscribirPosts, publicarPost, borrarPost, reaccionarPost,
  obtenerComentarios, comentarPost, borrarComentario, obtenerUsuariosActivos,
} from '../data/queries';
import { subirFotoFeed } from '../lib/feedFoto';
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

function Comentarios({ reto, post, usuario, fotos }) {
  const toast = useToast();
  const [comentarios, setComentarios] = useState(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    obtenerComentarios(reto.id, post.id).then(setComentarios).catch(() => setComentarios([]));
  }, [reto.id, post.id]);

  async function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    vibrate(20);
    try {
      await comentarPost(reto.id, post.id, usuario, t);
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
          <Avatar nombre={c.nombre} url={fotos[c.usuarioId]} className="comment-av" />
          <div className="comment-bubble">
            <b>{c.nombre.split(' ').slice(0, 2).join(' ')}</b>
            <p>{c.texto}</p>
            <span className="comment-meta">{hace(c.creadoEn)}</span>
          </div>
          {c.authUid === auth.currentUser?.uid && (
            <button className="comment-del" type="button" aria-label="Borrar comentario" onClick={() => { vibrate(); borrar(c); }}>✕</button>
          )}
        </div>
      ))}
      <form className="comment-form" onSubmit={enviar}>
        <Avatar nombre={usuario.nombre} url={usuario.photoURL} className="comment-av" />
        <input
          type="text"
          maxLength="300"
          placeholder="Escribe un comentario…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
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
  // Bloquea el scroll del fondo y cierra con Escape
  useEffect(() => {
    if (!foto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [foto, onClose]);

  // Portal al body: por encima de todo (la tabbar vive en otro stacking context)
  return createPortal(
    <div className={`lightbox ${foto ? 'show' : ''}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Foto a pantalla completa">
      {foto && (
        <>
          <img className="lightbox-img" src={foto.url} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-caption" onClick={(e) => e.stopPropagation()}>
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

function Post({ reto, post, usuario, fotos, onBorrar, onVerFoto }) {
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

  async function reaccionar(emoji) {
    vibrate(18);
    try {
      await reaccionarPost(reto.id, post.id, miReaccion === emoji ? null : emoji);
      // onSnapshot refresca el post solo; no hace falta estado local
    } catch {
      toast('No se pudo reaccionar.', true);
    }
  }

  const totalComentarios = post.numComentarios || 0;

  return (
    <article className="post">
      <header className="post-head">
        <Avatar nombre={post.nombre} url={fotos[post.usuarioId]} className="post-av" />
        <div className="post-author">
          <b>{post.nombre}</b>
          <span>{hace(post.creadoEn)}</span>
        </div>
        {post.authUid === miUid && (
          <button className="comment-del" type="button" aria-label="Borrar publicación" onClick={() => { vibrate(); onBorrar(post); }}>✕</button>
        )}
      </header>

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
              onClick={() => reaccionar(e)}
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
        <Comentarios reto={reto} post={post} usuario={usuario} fotos={fotos} />
      )}
    </article>
  );
}

export default function Feed() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const fileRef = useRef();

  const [posts, setPosts] = useState(null);
  const [fotos, setFotos] = useState({}); // usuarioId → photoURL
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

  // Avatares de todos para posts/comentarios
  useEffect(() => {
    obtenerUsuariosActivos(reto.id)
      .then((us) => setFotos(Object.fromEntries(us.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL]))))
      .catch(() => {});
  }, [reto.id]);

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
      {posts === null && <div className="rank-empty">Cargando el feed…</div>}
      {posts !== null && !posts.length && (
        <div className="rank-empty">Nadie ha publicado aún. ¡Rompe el hielo con tu primera foto! 📸</div>
      )}
      {(posts || []).map((p, i) => (
        <div key={p.id} className="post-wrap" style={{ animationDelay: `${Math.min(i * 0.06, 0.4)}s` }}>
          <Post reto={reto} post={p} usuario={usuario} fotos={fotos} onBorrar={setModalBorrar} onVerFoto={setFotoAbierta} />
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
