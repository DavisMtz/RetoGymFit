/**
 * Comentarios de una publicación con @menciones (autocomplete + resaltado).
 * Compartido entre el feed y la pantalla de publicación. Autocontenido:
 * al enviar, además de guardar el comentario, avisa a los @mencionados.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast, vibrate, Avatar } from './ui';
import {
  obtenerComentarios, comentarPost, borrarComentario, notificarMenciones,
} from '../data/queries';
import { auth } from '../firebase';

export function hace(ts) {
  if (!ts?.toDate) return 'ahora';
  const mins = Math.max(0, Math.round((Date.now() - ts.toDate().getTime()) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return `hace ${Math.round(mins / 1440)} d`;
}

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

export default function Comentarios({ reto, post, usuario, fotos, usuarios }) {
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
      // Aviso a quienes fueron @mencionados (no bloquea)
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
      {comentarios !== null && !comentarios.length && (
        <div className="post-comments-loading">Sé el primero en comentar 💬</div>
      )}
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
