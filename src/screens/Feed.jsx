/**
 * Feed social del reto: publica pensamientos o fotos fitness y reacciona con
 * emojis (con partículas 🎉). Tocar una publicación la abre en su propia
 * pantalla (#/post/{reto}/{id}) con los comentarios a la vista; los registros
 * de actividad aparecen como tarjetas automáticas. Se actualiza en vivo
 * (onSnapshot) para que se sienta como una red social del equipo.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  useToast, vibrate, Avatar, AvatarRing, Header, StatusStrip,
  PostSkeleton, usePullToRefresh, PullIndicator,
} from '../components/ui';
import {
  suscribirPosts, publicarPost, borrarPost, reaccionarPost,
  obtenerUsuariosActivos, obtenerRankingSemanal,
} from '../data/queries';
import { hace } from '../components/Comentarios';
import { subirFotoFeed } from '../lib/feedFoto';
import { punch, particulasEmoji, chispazo, revelarLista, revelarTitulo } from '../lib/anim';
import { auth } from '../firebase';

const EMOJIS = ['💪', '🔥', '👏', '😮', '❤️'];

function Post({ reto, post, fotos, dias, onBorrar, onAbrir }) {
  const toast = useToast();
  const { usuario } = useAuth();
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
    if (el && miReaccion !== emoji) {
      chispazo(el, { anillos: 1, tamano: 1.5 });
      particulasEmoji(el, emoji);
    }
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

  // Toda la tarjeta abre la publicación en su pantalla, salvo los controles
  // con acción propia (reacciones, borrar, avatar ampliable…)
  function alTocar(e) {
    if (e.target.closest('button, a, input, form')) return;
    onAbrir(post);
  }

  return (
    <article className="post post-tocable" onClick={alTocar}>
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
          aria-label="Abrir la publicación"
          onClick={() => { vibrate(12); onAbrir(post); }}
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
          className="comments-toggle"
          type="button"
          aria-label="Ver comentarios"
          onClick={() => { vibrate(12); onAbrir(post); }}
        >
          💬 {totalComentarios > 0 ? totalComentarios : ''}
        </button>
      </div>
    </article>
  );
}

export default function Feed() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const fileRef = useRef();
  const navigate = useNavigate();

  const [posts, setPosts] = useState(null);
  const [fotos, setFotos] = useState({});     // usuarioId → photoURL
  const [dias, setDias] = useState({});       // usuarioId → días de esta semana (anillo)
  const [texto, setTexto] = useState('');
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [modalBorrar, setModalBorrar] = useState(null); // post
  const tituloRef = useRef(null);
  const listaRef = useRef(null);

  // Feed en vivo
  useEffect(() => {
    const unsub = suscribirPosts(
      reto.id,
      setPosts,
      () => { toast('Error al cargar el feed', true); setPosts([]); },
    );
    return unsub;
  }, [reto.id, toast]);

  // Avatares y progreso semanal (anillos)
  const cargarGente = useCallback(async () => {
    const [us, ranking] = await Promise.all([
      obtenerUsuariosActivos(reto.id),
      obtenerRankingSemanal(reto).catch(() => []),
    ]);
    setFotos(Object.fromEntries(us.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])));
    setDias(Object.fromEntries(ranking.map((r) => [r.usuarioId, r.dias])));
  }, [reto]);

  useEffect(() => { cargarGente().catch(() => {}); }, [cargarGente]);

  const ptr = usePullToRefresh(() => cargarGente().catch(() => {}));

  useEffect(() => revelarTitulo(tituloRef.current, { retraso: 0.2 }), []);

  // El feed llega en vivo (onSnapshot), así que esto se vuelve a ejecutar en
  // cada cambio: `revelarLista` marca lo ya revelado y solo anima lo nuevo —
  // cuando alguien publica, entra SU tarjeta y las demás ni se enteran.
  useEffect(() => {
    if (!posts?.length) return undefined;
    return revelarLista(listaRef.current, '.post-wrap', { cascada: 0.06 });
  }, [posts]);

  // Cada publicación vive en su propia URL: se abre, se comparte, se enlaza
  const abrirPost = useCallback((p) => {
    navigate(`/post/${reto.id}/${p.id}`);
  }, [navigate, reto.id]);

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
        <h1 className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }} ref={tituloRef}>El feed del <em>equipo.</em></h1>
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
      {/* Las publicaciones viven dentro de su propio contenedor para que la
          transición de página anime UN bloque y no las cincuenta tarjetas:
          de eso ya se encarga `revelarLista` con el scroll. */}
      <div className="feed-lista" ref={listaRef}>
        {(posts || []).map((p) => (
          <div key={p.id} className="post-wrap">
            <Post
              reto={reto}
              post={p}
              fotos={fotos}
              dias={dias}
              onBorrar={setModalBorrar}
              onAbrir={abrirPost}
            />
          </div>
        ))}
      </div>

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
