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
 * Del papel picado siempre se dice lo mismo: que las figuras "se mueven con
 * el viento como si respiraran". Eso son DOS movimientos, no uno, y aquí van
 * en dos capas:
 *
 *   · RESPIRACIÓN — cada banderín con SU amplitud, SU duración y SU fase.
 *     Una sola línea de tiempo para los nueve los movía como un cartón
 *     rígido; con una por banderín la fila no se repite nunca igual.
 *   · RÁFAGA — cada tantos segundos entra aire de verdad: se van de lado y
 *     se ponen de canto (el papel se ve más angosto), con retardo por índice
 *     para que la onda RECORRA la cuerda en vez de golpearla entera a la vez.
 *     Y después el aire descansa: sin esa pausa sería un motor, no viento.
 *
 * Las dos capas se suman en CSS (--pp-vaiven + --pp-rafaga) en lugar de
 * animar las dos la propiedad rotate: dos tweens sobre la misma propiedad se
 * pisan —el último en escribir gana— y la respiración desaparecería en cuanto
 * entrara la primera ráfaga. Los valores llevan su unidad (deg) para no
 * depender de cómo GSAP adivine la unidad de una variable CSS.
 *
 * En segundo plano se pausa todo: la app se pasa media sesión en un bolsillo
 * y esto no tiene por qué gastarle batería a nadie.
 */
export function mecerPapelPicado(fila) {
  if (!fila || reducido()) return undefined;
  const banderines = Array.from(fila.querySelectorAll('.pp-banderin'));
  if (!banderines.length) return undefined;

  const respiracion = banderines.map((b, i) => gsap.timeline({
    repeat: -1, yoyo: true, delay: i * 0.08,
  }).fromTo(
    b,
    { '--pp-vaiven': `${(-gsap.utils.random(1.3, 2.6)).toFixed(2)}deg` },
    {
      '--pp-vaiven': `${gsap.utils.random(1.3, 2.6).toFixed(2)}deg`,
      duration: gsap.utils.random(2.3, 3.5),
      ease: 'sine.inOut',
    },
  ));

  const rafaga = gsap.timeline({ repeat: -1, repeatRefresh: true, delay: 2.5 })
    .to(banderines, {
      '--pp-rafaga': () => `${gsap.utils.random(3.5, 7).toFixed(2)}deg`,
      '--pp-canto': 0.9,
      duration: 0.5,
      ease: 'power2.out',
      stagger: { each: 0.055 },
    })
    .to(banderines, {
      '--pp-rafaga': '0deg',
      '--pp-canto': 1,
      duration: 1.9,
      ease: 'elastic.out(1, 0.42)',
      stagger: { each: 0.055 },
    }, 0.6)
    .to({}, { duration: () => gsap.utils.random(4, 10) });

  const todas = [...respiracion, rafaga];
  const alCambiarVisibilidad = () => todas.forEach((tl) => (
    document.hidden ? tl.pause() : tl.resume()
  ));
  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  return () => {
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    todas.forEach((tl) => tl.kill());
  };
}

/**
 * Colgar la guirnalda: cae desde arriba y se asienta con rebote, del centro
 * hacia los lados —que es el orden en que se cuelga una de verdad, primero el
 * clavo de en medio—. Se anima el nudo (.pp-nudo) y no el banderín, porque el
 * banderín ya lleva su propia inclinación en transform.
 */
export function colgarPapelPicado(fila) {
  if (!fila || reducido()) return;
  const nudos = fila.querySelectorAll('.pp-nudo');
  if (!nudos.length) return;
  gsap.fromTo(
    nudos,
    { y: -96, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 1.05, ease: 'elastic.out(0.68, 0.52)',
      stagger: { each: 0.045, from: 'center' }, clearProps: 'transform',
    },
  );
}

/**
 * Descolgarla: se la lleva el aire, hacia arriba y de lado. Se usa al apagar
 * el tema — desaparecer de golpe se leía como un fallo, no como una decisión.
 * App desmonta el componente pase lo que pase con esta animación.
 */
export function descolgarPapelPicado(fila) {
  if (!fila) return;
  const nudos = fila.querySelectorAll('.pp-nudo');
  const banderines = fila.querySelectorAll('.pp-banderin');
  if (reducido()) { gsap.set(nudos, { opacity: 0 }); return; }
  gsap.to(nudos, {
    y: -30, opacity: 0, duration: 0.42, ease: 'power2.in',
    stagger: { each: 0.028, from: 'start' },
  });
  gsap.to(banderines, {
    '--pp-rafaga': '24deg', '--pp-canto': 0.72, duration: 0.5, ease: 'power2.in',
    stagger: { each: 0.028, from: 'start' },
  });
}

/**
 * El emblema del modal: se dibuja la campana y LUEGO SE TOCA.
 *
 * El Grito se anuncia repicando la campana de Dolores, así que dejarla quieta
 * era desperdiciar el único gesto que la vuelve inconfundible. El badajo va un
 * pelo retrasado respecto al cuerpo —así se mueve una campana de verdad— y de
 * cada golpe salen ondas: sin ellas el dibujo se mece; con ellas, suena.
 */
export function trazarEmblema(svg) {
  if (!svg || reducido()) return undefined;
  const tl = gsap.timeline();

  tl.fromTo(
    svg.querySelectorAll('[data-trazo]'),
    { strokeDasharray: 320, strokeDashoffset: 320, opacity: 0 },
    { strokeDashoffset: 0, opacity: 1, duration: 1.15, ease: 'power2.inOut', stagger: 0.12 },
  ).fromTo(
    svg.querySelectorAll('[data-relleno]'),
    { scale: 0, transformOrigin: '50% 50%' },
    { scale: 1, duration: 0.7, ease: 'back.out(2.2)', stagger: 0.06 },
    0.5,
  );

  const campana = svg.querySelector('[data-campana]');
  if (!campana) return () => tl.kill();

  // El yugo: la campana gira colgada de su eje, no de su centro.
  gsap.set(campana, { transformOrigin: '48px 26px' });
  // El repique empieza cuando la campana YA está dibujada. Con '>' se
  // colgaba del último tween AÑADIDO (el relleno, que acaba antes), y la
  // campana se ponía a repicar mientras todavía se trazaba su contorno.
  tl.addLabel('repique', Math.max(0, tl.duration() - 0.15))
    .to(campana, { rotate: 8.5, duration: 0.26, ease: 'power2.out' }, 'repique')
    .to(campana, { rotate: -6.5, duration: 0.42, ease: 'sine.inOut' })
    .to(campana, { rotate: 4.5, duration: 0.4, ease: 'sine.inOut' })
    .to(campana, { rotate: -2.6, duration: 0.38, ease: 'sine.inOut' })
    .to(campana, { rotate: 0, duration: 0.46, ease: 'sine.out' });

  const badajo = svg.querySelector('[data-badajo]');
  if (badajo) {
    // El badajo entra un pelo tarde: esa demora es la campana.
    gsap.set(badajo, { transformOrigin: '48px 32px' });
    tl.to(badajo, { rotate: 14, duration: 0.3, ease: 'sine.inOut' }, 'repique+=0.08')
      .to(badajo, { rotate: -11, duration: 0.42, ease: 'sine.inOut' }, 'repique+=0.38')
      .to(badajo, { rotate: 7, duration: 0.4, ease: 'sine.inOut' }, 'repique+=0.8')
      .to(badajo, { rotate: 0, duration: 0.62, ease: 'sine.out' }, 'repique+=1.2');
  }

  // Una onda por golpe, cuando el badajo pega en la falda.
  svg.querySelectorAll('[data-onda]').forEach((onda, i) => {
    tl.fromTo(
      onda,
      { scale: 0.34, opacity: 0.6, transformOrigin: '48px 48px' },
      { scale: 1.95, opacity: 0, duration: 1.15, ease: 'power2.out' },
      `repique+=${0.2 + i * 0.42}`,
    );
  });

  const rayos = svg.querySelectorAll('[data-rayo]');
  if (rayos.length) {
    tl.to(rayos, {
      scale: 1.18, duration: 0.24, ease: 'power2.out',
      transformOrigin: '48px 46px', yoyo: true, repeat: 1, stagger: 0.02,
    }, 'repique+=0.04');
  }

  return () => tl.kill();
}

/**
 * Fuegos artificiales de la noche del Grito.
 *
 * Lienzo 2D movido por el ticker de GSAP, no WebGL: son unos cientos de
 * partículas y esta app se usa en el gimnasio, con la pantalla a media luz y
 * la batería a medias. Un contexto WebGL costaría más batería y más KB que
 * todo lo que ahorra, para un efecto que a 60fps se ve igual.
 *
 * Lo que se copió de la pirotecnia de verdad, la de los castillos:
 *
 *   · UN COHETE SUBE ANTES DE TRONAR. Antes las esferas se materializaban de
 *     la nada en el aire; ahora sale una caña desde abajo dejando chispas y
 *     el trueno pasa cuando se le acaba el impulso. Es el 80% de que se lea
 *     como pirotecnia y no como confeti.
 *   · NO TODOS LOS TRUENOS SON IGUALES: peonía (la esfera clásica), sauce
 *     (pocas chispas doradas, pesadas, que se quedan colgando y caen en
 *     ramas) y cascabel (chispas chicas que centellean al apagarse).
 *   · LA LUZ SE SUMA: con globalCompositeOperation = lighter dos chispas
 *     encimadas dan blanco, como la luz de verdad. Sin eso el trueno se ve
 *     plano y sucio.
 *   · LAS CHISPAS DEJAN ESTELA: cada una se dibuja como el trazo entre donde
 *     estaba y donde está, no como un punto. Sale gratis y cambia todo.
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

  const GRAVEDAD = 0.045;
  const azar = (a, b) => a + Math.random() * (b - a);
  const unColor = () => colores[Math.floor(Math.random() * colores.length)];

  const chispas = [];    // lo que ya tronó
  const canas = [];      // los cohetes que van subiendo
  const destellos = [];  // el fogonazo de cada trueno, dura un parpadeo

  // La caña frena a este ritmo. De aquí sale con cuánto impulso hay que
  // lanzarla para que reviente ARRIBA y no a media pantalla.
  const FRENO = GRAVEDAD * 1.6;

  function chispa(x, y, vx, vy, col, op = {}) {
    chispas.push({
      x, y, px: x, py: y, vx, vy, col,
      vida: 1,
      decaimiento: op.decaimiento ?? azar(0.008, 0.017),
      peso: op.peso ?? 1,
      arrastre: op.arrastre ?? 0.987,
      centellea: Boolean(op.centellea),
      grosor: op.grosor ?? 1.7,
    });
  }

  function estallar(x, y, col) {
    destellos.push({ x, y, vida: 1, col, radio: 26 + Math.random() * 18 });
    const suerte = Math.random();
    if (suerte < 0.24) {
      // SAUCE: pocas chispas, doradas y pesadas, que caen en ramas.
      for (let i = 0; i < 34; i += 1) {
        const ang = (Math.PI * 2 * i) / 34 + azar(-0.12, 0.12);
        const vel = azar(1, 2.1);
        chispa(x, y, Math.cos(ang) * vel, Math.sin(ang) * vel, '#ffd84d', {
          decaimiento: azar(0.0035, 0.006), peso: 1.4, arrastre: 0.993, grosor: 2.1,
        });
      }
      return;
    }
    if (suerte < 0.46) {
      // CASCABEL: muchas chispas chicas que centellean al apagarse.
      for (let i = 0; i < 70; i += 1) {
        const ang = azar(0, Math.PI * 2);
        const vel = azar(0.5, 3.2);
        chispa(x, y, Math.cos(ang) * vel, Math.sin(ang) * vel, col, {
          decaimiento: azar(0.012, 0.024), grosor: 1.3, centellea: true,
        });
      }
      return;
    }
    // PEONÍA: la esfera clásica, con un corazón blanco más lento adentro.
    const n = 48 + Math.floor(Math.random() * 18);
    for (let i = 0; i < n; i += 1) {
      const ang = (Math.PI * 2 * i) / n + azar(-0.1, 0.1);
      const vel = azar(1.6, 4);
      chispa(x, y, Math.cos(ang) * vel, Math.sin(ang) * vel, col);
    }
    for (let i = 0; i < 18; i += 1) {
      const ang = azar(0, Math.PI * 2);
      const vel = azar(0.4, 1.4);
      chispa(x, y, Math.cos(ang) * vel, Math.sin(ang) * vel, '#ffffff', {
        decaimiento: azar(0.016, 0.03), grosor: 1.2,
      });
    }
  }

  function lanzar() {
    const desde = alto + 8;
    const meta = alto * azar(0.1, 0.34);
    canas.push({
      x: azar(ancho * 0.15, ancho * 0.85),
      vx: azar(-0.35, 0.35),
      y: desde,
      // v = sqrt(2·a·h): el impulso exacto para llegar sin sobrar.
      vy: -Math.sqrt(2 * FRENO * (desde - meta)) * azar(1, 1.05),
      meta,
      col: unColor(),
    });
  }

  let desdeUltimo = 30;   // el primero sale casi enseguida
  const tick = () => {
    ctx.clearRect(0, 0, ancho, alto);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    desdeUltimo += 1;
    if (desdeUltimo > 38) { desdeUltimo = 0; lanzar(); }

    for (let i = canas.length - 1; i >= 0; i -= 1) {
      const c = canas[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += FRENO;            // la caña pesa: por eso frena y truena arriba
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - c.vy);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      if (Math.random() < 0.75) {
        chispa(c.x, c.y, azar(-0.35, 0.35), azar(0.2, 0.9), '#ffd84d', {
          decaimiento: azar(0.05, 0.09), peso: 0.35, grosor: 1.1,
        });
      }
      if (c.y <= c.meta || c.vy >= -0.55) {
        estallar(c.x, c.y, c.col);
        canas.splice(i, 1);
      }
    }

    for (let i = destellos.length - 1; i >= 0; i -= 1) {
      const d = destellos[i];
      d.vida -= 0.11;
      if (d.vida <= 0) { destellos.splice(i, 1); continue; }
      const r = d.radio * (1.35 - d.vida * 0.5);
      const halo = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
      halo.addColorStop(0, d.col);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = d.vida * 0.5;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = chispas.length - 1; i >= 0; i -= 1) {
      const p = chispas[i];
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVEDAD * p.peso;
      p.vx *= p.arrastre;      // el aire las frena
      p.vy *= p.arrastre;
      p.vida -= p.decaimiento;
      if (p.vida <= 0) { chispas.splice(i, 1); continue; }
      const centelleo = p.centellea && p.vida < 0.55 && Math.random() < 0.45 ? 0.3 : 1;
      ctx.globalAlpha = Math.min(p.vida * 1.9, 1) * centelleo;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = p.grosor;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  gsap.ticker.add(tick);

  return () => {
    destellos.length = 0;
    gsap.ticker.remove(tick);
    window.removeEventListener('resize', redimensionar);
    ctx.clearRect(0, 0, ancho, alto);
  };
}
