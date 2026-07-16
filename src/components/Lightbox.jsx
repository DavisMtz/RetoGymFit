/** Visor de foto a pantalla completa (compartido por feed y publicación). */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { abrirLightbox } from '../lib/anim';

export default function Lightbox({ foto, onClose }) {
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
