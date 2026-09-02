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
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

const reducido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Capas flotantes que NUNCA deben entrar en la cascada de página:
// los modales/hojas viven ocultos en el DOM (opacity 0) y animarlos
// los haría parpadear al cambiar de sección.
const SELECTOR_FLOTANTES = '.modal-overlay, .sheet-overlay, .lightbox, .toast, .instalar-banner, .celebra-overlay';

/** Transición de página: los hijos directos del contenedor entran en cascada. */
export function entradaPagina(contenedor) {
  if (!contenedor || reducido()) return undefined;
  const hijos = Array.from(contenedor.children)
    .filter((el) => !el.matches(SELECTOR_FLOTANTES))
    .slice(0, 10);
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

/** Micro-interacción "punch": el elemento late al tocarlo (reacciones, tabs). */
export function punch(el, escala = 1.25) {
  if (!el || reducido()) return;
  gsap.fromTo(el, { scale: 1 }, {
    scale: escala, duration: 0.14, ease: 'power2.out',
    yoyo: true, repeat: 1, transformOrigin: 'center',
    onComplete: () => gsap.set(el, { clearProps: 'transform' }),
  });
}

/** Apertura del visor de avatar: zoom elástico de la foto + nombre. */
export function abrirAvatar(el, nombre) {
  if (reducido()) return;
  if (el) gsap.fromTo(el, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)' });
  if (nombre) gsap.fromTo(nombre, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, delay: 0.1, ease: 'power2.out' });
}

/**
 * FLIP de listas (ranking): captura las posiciones ANTES de mutar el estado
 * y anima cada fila hasta su nueva posición después del re-render.
 *
 *   const estado = capturarFlip(listaRef.current);  // antes de setState
 *   ...React re-renderiza...
 *   animarFlip(estado);                              // en useLayoutEffect
 *
 * Las filas necesitan data-flip-id estable (p.ej. el usuarioId).
 */
export function capturarFlip(contenedor) {
  if (!contenedor || reducido()) return null;
  const filas = contenedor.querySelectorAll('[data-flip-id]');
  if (!filas.length) return null;
  return Flip.getState(filas);
}

export function animarFlip(estado) {
  if (!estado || reducido()) return;
  Flip.from(estado, {
    duration: 0.6,
    ease: 'power3.inOut',
    stagger: 0.02,
    onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.4 }),
    onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.25 }),
  });
}

/**
 * Explosión de partículas de emoji (estilo corazones de IG Live): copias del
 * emoji salen flotando desde el elemento tocado y se desvanecen. Los spans
 * viven en un portal propio en el body y se limpian solos al terminar.
 */
export function particulasEmoji(el, emoji, cantidad = 6) {
  if (!el || reducido()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const capa = document.createElement('div');
  capa.className = 'particulas-capa';
  capa.setAttribute('aria-hidden', 'true');
  document.body.appendChild(capa);
  let vivas = cantidad;
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement('span');
    p.className = 'particula-emoji';
    p.textContent = emoji;
    capa.appendChild(p);
    const angulo = (-90 + gsap.utils.random(-55, 55)) * (Math.PI / 180);
    const distancia = gsap.utils.random(52, 110);
    gsap.set(p, { x: cx, y: cy, scale: gsap.utils.random(0.6, 1.15), opacity: 1 });
    gsap.to(p, {
      x: cx + Math.cos(angulo) * distancia,
      y: cy + Math.sin(angulo) * distancia,
      rotation: gsap.utils.random(-40, 40),
      scale: gsap.utils.random(1.1, 1.7),
      opacity: 0,
      duration: gsap.utils.random(0.7, 1.1),
      delay: i * 0.04,
      ease: 'power2.out',
      onComplete: () => { p.remove(); if (--vivas === 0) capa.remove(); },
    });
  }
  // Red de seguridad por si alguna animación se interrumpe (cambio de página)
  setTimeout(() => capa.remove(), 2000);
}

/** Entrada de la celebración post-registro: check, racha y bloques en cascada. */
export function entradaCelebracion(overlay) {
  if (!overlay) return;
  if (reducido()) return;
  const icono = overlay.querySelector('.celebra-icono');
  const bloques = overlay.querySelectorAll('.celebra-anim');
  const tl = gsap.timeline();
  if (icono) {
    tl.fromTo(icono, { scale: 0, rotation: -30 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(2.2)' });
  }
  if (bloques.length) {
    tl.fromTo(
      bloques,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.1, clearProps: 'transform,opacity' },
      '-=0.25',
    );
  }
  return () => tl.kill();
}

/* ═══════════════════════════════════════════════════════════════════════
   TEMA PATRIO — septiembre
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Vaivén del papel picado.
 *
 * El stagger es lo que hace que se sienta cuerda y no bloque: cada banderín
 * arranca un poco después que el anterior, así la onda recorre la fila como
 * lo haría el aire. Sin él, los doce se mecerían a la vez y parecería un
 * cartón rígido.
 */
export function mecerPapelPicado(fila) {
  if (!fila || reducido()) return undefined;
  const banderines = Array.from(fila.children);
  if (!banderines.length) return undefined;
  const tl = gsap.timeline({ repeat: -1, yoyo: true });
  tl.fromTo(
    banderines,
    { rotate: -2.6 },
    {
      rotate: 2.6,
      duration: 2.6,
      ease: 'sine.inOut',
      stagger: { each: 0.09, from: 'start' },
    },
  );
  return () => tl.kill();
}

/** Entrada de la guirnalda: cae desde arriba y se asienta con rebote. */
export function caerPapelPicado(fila) {
  if (!fila || reducido()) return;
  gsap.fromTo(
    Array.from(fila.children),
    { y: -70, opacity: 0, rotate: 0 },
    {
      y: 0, opacity: 0.92, duration: 1.1, ease: 'elastic.out(0.65, 0.5)',
      stagger: { each: 0.045, from: 'center' },
    },
  );
}

/** Aparición del emblema del modal: se dibuja el trazo y luego entra el relleno. */
export function trazarEmblema(svg) {
  if (!svg || reducido()) return;
  const trazos = svg.querySelectorAll('[data-trazo]');
  gsap.fromTo(
    trazos,
    { strokeDasharray: 320, strokeDashoffset: 320, opacity: 0 },
    { strokeDashoffset: 0, opacity: 1, duration: 1.15, ease: 'power2.inOut', stagger: 0.12 },
  );
  gsap.fromTo(
    svg.querySelectorAll('[data-relleno]'),
    { scale: 0, transformOrigin: '50% 50%' },
    { scale: 1, duration: 0.7, ease: 'back.out(2.2)', stagger: 0.06, delay: 0.5 },
  );
}

/**
 * Fuegos artificiales de la noche del Grito.
 *
 * Lienzo 2D movido por el ticker de GSAP, no WebGL: son unas cientos de
 * partículas y esta app se usa en el gimnasio, con la pantalla a media luz y
 * la batería a medias. Un contexto WebGL costaría más batería y más KB que
 * todo lo que ahorra, para un efecto que a 60fps se ve igual.
 *
 * Devuelve la función para detenerlo.
 */
export function cohetesDelGrito(canvas, colores) {
  if (!canvas || reducido()) return () => {};
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let ancho = 0;
  let alto = 0;

  const redimensionar = () => {
    ancho = canvas.clientWidth;
    alto = canvas.clientHeight;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  redimensionar();
  window.addEventListener('resize', redimensionar);

  const particulas = [];
  const GRAVEDAD = 0.045;

  function estallar(x, y, color) {
    const n = 46 + Math.floor(Math.random() * 20);
    for (let i = 0; i < n; i += 1) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const vel = 1.6 + Math.random() * 2.4;
      particulas.push({
        x, y,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel,
        vida: 1,
        decaimiento: 0.008 + Math.random() * 0.009,
        color,
      });
    }
  }

  let desdeUltimo = 0;
  const tick = () => {
    ctx.clearRect(0, 0, ancho, alto);

    // Un cohete nuevo cada ~45 frames, en la mitad superior de la pantalla
    desdeUltimo += 1;
    if (desdeUltimo > 45) {
      desdeUltimo = 0;
      estallar(
        ancho * (0.15 + Math.random() * 0.7),
        alto * (0.12 + Math.random() * 0.33),
        colores[Math.floor(Math.random() * colores.length)],
      );
    }

    for (let i = particulas.length - 1; i >= 0; i -= 1) {
      const p = particulas[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVEDAD;
      p.vx *= 0.987;          // el aire las frena
      p.vida -= p.decaimiento;
      if (p.vida <= 0) { particulas.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(p.vida, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('resize', redimensionar);
    ctx.clearRect(0, 0, ancho, alto);
  };
}
