/**
 * Animaciones con GSAP 3.13.
 *
 * Centraliza los efectos de la app para que se sientan consistentes:
 *  - entradaPagina: transición al cambiar de pestaña (fade + rise con stagger)
 *  - abrirLightbox: zoom elástico del visor de fotos
 *  - entradaPodio: los 3 lugares suben con rebote (oro al último para el drama)
 *
 * Todo respeta prefers-reduced-motion: si está activo, los elementos
 * simplemente aparecen sin movimiento.
 */
import { gsap } from 'gsap';

const reducido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Transición de página: los hijos directos del contenedor entran en cascada. */
export function entradaPagina(contenedor) {
  if (!contenedor || reducido()) return undefined;
  const hijos = Array.from(contenedor.children).slice(0, 10);
  if (!hijos.length) return undefined;
  const tl = gsap.timeline();
  tl.fromTo(
    contenedor,
    { opacity: 0 },
    { opacity: 1, duration: 0.25, ease: 'power1.out' },
    0,
  ).fromTo(
    hijos,
    { y: 22, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out', stagger: 0.06, clearProps: 'transform,opacity' },
    0,
  );
  return () => tl.kill();
}

/** Apertura del lightbox: la foto entra con zoom elástico y el pie sube. */
export function abrirLightbox(img, caption) {
  if (reducido()) return;
  if (img) {
    gsap.fromTo(img, { scale: 0.82, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.6)' });
  }
  if (caption) {
    gsap.fromTo(caption, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay: 0.12, ease: 'power2.out' });
  }
}

/** Podio: plata y bronce suben primero, el oro cae al final con rebote. */
export function entradaPodio(contenedor) {
  if (!contenedor || reducido()) return undefined;
  const cols = contenedor.querySelectorAll('.podium-col');
  if (!cols.length) return undefined;
  const tl = gsap.timeline();
  tl.fromTo(
    cols,
    { y: 44, opacity: 0, scale: 0.9 },
    {
      y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.7)',
      // orden visual: 2º, 3º y el 1º al final
      stagger: { each: 0.14, from: 'start' },
      clearProps: 'transform,opacity',
    },
  );
  const corona = contenedor.querySelector('.podium-crown');
  if (corona) {
    tl.fromTo(corona, { y: -26, opacity: 0, rotate: -18 }, { y: 0, opacity: 1, rotate: 0, duration: 0.5, ease: 'bounce.out' }, '-=0.2');
  }
  return () => tl.kill();
}

/** Entrada del banner de instalación: se asoma desde abajo con rebote suave. */
export function entradaBanner(el) {
  if (!el || reducido()) return;
  gsap.fromTo(el, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: 'back.out(1.4)' });
}

/** Salida del banner (devuelve una promesa para desmontar después). */
export function salidaBanner(el) {
  if (!el || reducido()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.to(el, { y: 110, opacity: 0, duration: 0.35, ease: 'power2.in', onComplete: resolve });
  });
}
