/**
 * SISTEMA DE MOVIMIENTO — GSAP 3.13
 *
 * Un solo archivo manda sobre todo lo que se mueve en la app, para que las
 * seis pantallas se sientan la misma app y no seis demos distintas.
 *
 * Tres reglas que valen para TODO lo de aquí abajo:
 *
 *  1. NINGUNA animación es lo único que hace visible algo. Los reveals usan
 *     `from` (el estado natural del elemento ES el final) o `fromTo` con
 *     destino explícito y `clearProps`. Si GSAP no llegara a correr, el
 *     contenido simplemente está ahí. Y lo que sí nace oculto lleva red de
 *     seguridad: `blindar()` lo termina aunque el navegador congele el rAF
 *     con la pestaña en segundo plano.
 *  2. `prefers-reduced-motion` se respeta arriba de todo, en `reducido()`.
 *     Cuando está activo no se anima: se pone el estado final y ya.
 *  3. Las curvas son las MISMAS del CSS. `--spring`, `--spring-soft`,
 *     `--soft` y `--smooth` viven aquí como eases de GSAP con los mismos
 *     números, así que una tarjeta que entra con JS y otra que responde con
 *     `transition` se mueven igual. Es la diferencia entre "tiene
 *     animaciones" y "está animada".
 */
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { CustomWiggle } from 'gsap/CustomWiggle';

gsap.registerPlugin(Flip, ScrollTrigger, SplitText, DrawSVGPlugin, Physics2DPlugin, CustomEase, CustomWiggle);

// El teléfono esconde y saca la barra de direcciones al hacer scroll: sin
// esto, ScrollTrigger recalcularía todo en cada uno de esos cambios de alto.
ScrollTrigger.config({ ignoreMobileResize: true });

/* ── Las curvas del sistema de diseño, tal cual están en global.css ────── */
CustomEase.create('rgf-spring', '0.34,1.56,0.64,1');      // --spring
CustomEase.create('rgf-spring-soft', '0.16,1.2,0.3,1');   // --spring-soft
CustomEase.create('rgf-soft', '0.22,0.61,0.36,1');        // --soft
CustomEase.create('rgf-smooth', '0.4,0,0.2,1');           // --smooth
// Un tembleque decreciente para avisos (la franja de peligro, un error).
CustomWiggle.create('rgf-tembleque', { wiggles: 7, type: 'easeOut' });

export const EASE = {
  spring: 'rgf-spring',
  springSoft: 'rgf-spring-soft',
  soft: 'rgf-soft',
  smooth: 'rgf-smooth',
  entrada: 'power3.out',
  salida: 'power2.in',
  tembleque: 'rgf-tembleque',
};

export const reducido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * ¿Toca animar la ENTRADA de algo?
 *
 * No, si el usuario pidió menos movimiento. Y tampoco si la pantalla está
 * naciendo en una pestaña que nadie está viendo: el navegador congela ahí el
 * `requestAnimationFrame`, la entrada se queda a medias y lo que debía
 * aparecer no aparece nunca. Es exactamente lo que pasa al abrir la app
 * desde un enlace de WhatsApp, y por eso en ese caso no se anima: el
 * contenido se pone y ya. Lo comprobó el banco de pruebas, no la intuición.
 *
 * Ojo: esto es para entradas. Las micro-interacciones (un toque, una
 * reacción) solo miran `reducido()`, porque si hay un dedo en la pantalla la
 * pestaña se está viendo por definición.
 */
const sinMovimiento = () => reducido() || (typeof document !== 'undefined' && document.hidden);

// Capas flotantes que NUNCA deben entrar en la cascada de página:
// los modales/hojas viven ocultos en el DOM (opacity 0) y animarlos
// los haría parpadear al cambiar de sección.
const SELECTOR_FLOTANTES = '.modal-overlay, .sheet-overlay, .lightbox, .toast, .instalar-banner, .celebra-overlay';

/**
 * Red de seguridad de una línea de tiempo que nace con el contenido oculto.
 *
 * El navegador congela `requestAnimationFrame` en pestañas de segundo plano
 * —justo lo que pasa al abrir la app desde un enlace de WhatsApp—, así que
 * una animación puede no llegar nunca a su último fotograma y dejar media
 * pantalla invisible sin un solo error en consola. Aquí se fuerza el final
 * si eso ocurre; el temporizador es el que garantiza, la animación solo
 * decora. Devuelve la función de limpieza.
 */
function blindar(tl) {
  const forzar = () => { if (tl.progress() < 1) tl.progress(1); };
  const alCambiarVisibilidad = () => { if (document.hidden) forzar(); };
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  const reloj = setTimeout(forzar, (tl.totalDuration() + 1.2) * 1000);
  if (document.hidden) forzar();
  return () => {
    clearTimeout(reloj);
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    tl.kill();
  };
}

/** Pausa un bucle infinito mientras la app está en un bolsillo. */
function ahorrarEnSegundoPlano(...animaciones) {
  const alCambiar = () => animaciones.forEach((a) => (document.hidden ? a.pause() : a.resume()));
  document.addEventListener('visibilitychange', alCambiar);
  return () => {
    document.removeEventListener('visibilitychange', alCambiar);
    animaciones.forEach((a) => a.kill());
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   TRANSICIÓN DE PÁGINA
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Transición de página: los bloques de la pantalla entran en cascada.
 *
 * `direccion` (-1, 0, +1) es hacia dónde te moviste en la barra de pestañas.
 * Con eso la pantalla nueva entra por el lado del que vienes, como en una
 * app nativa: ir de Hoy a Ranking se siente "hacia la derecha" y volver se
 * siente "hacia la izquierda". Sin dirección (llegar por un enlace) entra
 * de abajo, que es la entrada neutral de siempre.
 */
export function entradaPagina(contenedor, opciones = {}) {
  if (!contenedor || sinMovimiento()) return undefined;
  const { direccion = 0 } = opciones;
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
    { y: direccion ? 10 : 22, x: direccion * 38, opacity: 0 },
    {
      y: 0,
      x: 0,
      opacity: 1,
      duration: 0.62,
      ease: EASE.entrada,
      stagger: 0.055,
      clearProps: 'transform,opacity',
    },
    0,
  );
  // Y dentro de cada bloque marcado con `.stagger`, una segunda cascada más
  // corta: la pantalla llega en dos tiempos (los bloques, y lo de adentro),
  // que es lo que separa una transición de un simple fundido.
  const internos = interioresDeStagger(contenedor);
  if (internos.length) {
    tl.fromTo(
      internos,
      { y: 16, opacity: 0 },
      {
        y: 0, opacity: 1, duration: 0.5, ease: EASE.entrada,
        stagger: 0.06, clearProps: 'transform,opacity',
      },
      0.14,
    );
  }
  return blindar(tl);
}

/**
 * Los hijos de los bloques `.stagger`, menos los titulares: esos tienen su
 * propio revelado palabra por palabra y sumarle un desplazamiento del bloque
 * entero convierte dos gestos claros en uno confuso.
 */
function interioresDeStagger(contenedor) {
  if (!contenedor) return [];
  const grupos = contenedor.matches?.('.stagger')
    ? [contenedor]
    : Array.from(contenedor.querySelectorAll('.stagger'));
  return grupos.flatMap((g) => Array.from(g.children).filter((el) => el.dataset.anim !== 'titulo'));
}

/**
 * Cascada suelta de los bloques `.stagger` de una pantalla que no pasa por
 * la transición de página (el onboarding, que vive fuera del router).
 */
export function revelarBloques(contenedor, opciones = {}) {
  if (!contenedor || sinMovimiento()) return undefined;
  const { retraso = 0.05, cascada = 0.07 } = opciones;
  const internos = interioresDeStagger(contenedor);
  if (!internos.length) return undefined;
  const tl = gsap.timeline();
  tl.fromTo(
    internos,
    { y: 24, opacity: 0 },
    {
      y: 0, opacity: 1, duration: 0.65, delay: retraso, ease: EASE.entrada,
      stagger: cascada, clearProps: 'transform,opacity',
    },
  );
  return blindar(tl);
}

/* ═══════════════════════════════════════════════════════════════════════
   REVELADOS — lo que aparece
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Titular partido en palabras que suben tras una máscara por línea.
 *
 * Es `from`, no `fromTo`: el destino es el estado natural del titular, así
 * que si esto no corriera el texto ya está escrito y legible. `autoSplit`
 * vuelve a partirlo cuando terminan de cargar las tipografías o cuando el
 * teléfono gira — sin eso, el corte de líneas se calcula con la fuente de
 * respaldo y las palabras quedan repartidas mal.
 */
export function revelarTitulo(el, opciones = {}) {
  if (!el || sinMovimiento()) return undefined;
  const { retraso = 0.1, duracion = 0.85, cascada = 0.055 } = opciones;
  let cerrarEntrada;
  const particion = SplitText.create(el, {
    type: 'lines,words',
    mask: 'lines',
    linesClass: 'anim-linea',
    wordsClass: 'anim-palabra',
    autoSplit: true,
    onSplit: (self) => {
      const entrada = gsap.from(self.words, {
        yPercent: 120,
        opacity: 0,
        duration: duracion,
        delay: retraso,
        ease: 'expo.out',
        stagger: cascada,
      });
      // Las palabras nacen invisibles: si la pestaña se oculta antes de que
      // terminen de subir, el titular se quedaría en blanco. `blindar` las
      // deja puestas. (`autoSplit` puede volver a partir el titulo cuando
      // cargan las tipografías: cada corte trae su propia red.)
      cerrarEntrada?.();
      cerrarEntrada = blindar(entrada);
      return entrada;
    },
  });
  return () => { cerrarEntrada?.(); particion.revert(); };
}

/**
 * Revelado de listas largas (feed, historial, clasificación).
 *
 * Lo que YA se ve al montar entra en cascada de inmediato; lo que está más
 * abajo se oculta y espera a que el scroll lo alcance. Esa división no es
 * un capricho: si todo dependiera del scroll y ScrollTrigger fallara, la
 * pantalla se quedaría en blanco. Así, lo que está a la vista no depende
 * jamás de un evento de scroll.
 *
 * Marca cada elemento con `data-revelado` para no volver a revelar lo que
 * ya entró: en el feed en vivo, cuando llega una publicación nueva solo se
 * anima ella y las demás se quedan quietas.
 */
export function revelarLista(contenedor, selector, opciones = {}) {
  if (!contenedor || sinMovimiento()) return undefined;
  const { y = 24, duracion = 0.6, cascada = 0.07, retraso = 0 } = opciones;
  const nuevos = gsap.utils
    .toArray(contenedor.querySelectorAll(selector))
    .filter((el) => !el.dataset.revelado);
  if (!nuevos.length) return undefined;
  nuevos.forEach((el) => { el.dataset.revelado = '1'; });

  const alto = window.innerHeight || 800;
  const aLaVista = [];
  const porLlegar = [];
  nuevos.forEach((el) => {
    (el.getBoundingClientRect().top < alto * 0.92 ? aLaVista : porLlegar).push(el);
  });

  // Cada tween que nace con el contenido oculto lleva su red de seguridad:
  // si la pestaña se va a segundo plano a media entrada, se termina sola.
  const cierres = [];
  if (aLaVista.length) {
    cierres.push(blindar(gsap.fromTo(
      aLaVista,
      { y, opacity: 0 },
      {
        y: 0, opacity: 1, duration: duracion, delay: retraso, ease: EASE.entrada,
        stagger: cascada, clearProps: 'transform,opacity',
      },
    )));
  }

  let disparadores = [];
  if (porLlegar.length) {
    gsap.set(porLlegar, { y, opacity: 0 });
    disparadores = ScrollTrigger.batch(porLlegar, {
      start: 'top 93%',
      once: true,
      onEnter: (lote) => {
        cierres.push(blindar(gsap.to(lote, {
          y: 0, opacity: 1, duration: duracion, ease: EASE.entrada,
          stagger: cascada, clearProps: 'transform,opacity',
        })));
      },
    });
  }

  return () => {
    cierres.forEach((c) => c());
    disparadores.forEach((d) => d.kill());
    // Al desmontar, nada puede quedarse invisible esperando un scroll.
    if (porLlegar.length) gsap.set(porLlegar, { clearProps: 'transform,opacity' });
  };
}

/**
 * Cascada de "pops" para grupos chicos que caben de un vistazo: los avatares
 * de quienes ya entrenaron hoy, las tarjetas de estadísticas. No usa
 * ScrollTrigger a propósito — para seis u ocho elementos que ya están a la
 * vista, un disparador de scroll es maquinaria de más.
 */
export function popEnCascada(contenedor, selector, opciones = {}) {
  if (!contenedor || sinMovimiento()) return undefined;
  const els = contenedor.querySelectorAll(selector);
  if (!els.length) return undefined;
  const { retraso = 0.1, cascada = 0.05, desde = 'start', escala = 0.4 } = opciones;
  const tl = gsap.timeline({ delay: retraso });
  tl.fromTo(
    els,
    { scale: escala, opacity: 0 },
    {
      scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)',
      stagger: { each: cascada, from: desde }, clearProps: 'transform,opacity',
    },
  );
  return blindar(tl);
}

/**
 * La semana visual: los siete días se encienden de lunes a domingo y el de
 * HOY se queda respirando. Ese latido no es decoración: en una pantalla
 * llena de círculos iguales es lo que dice "aquí estás parado".
 */
export function revelarSemana(contenedor, opciones = {}) {
  if (!contenedor || sinMovimiento()) return undefined;
  const { retraso = 0 } = opciones;
  const puntos = contenedor.querySelectorAll('.week-dot-circle');
  if (!puntos.length) return undefined;

  const tl = gsap.timeline({ delay: retraso });
  tl.fromTo(
    puntos,
    { scale: 0.25, opacity: 0 },
    {
      scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.4)',
      stagger: 0.05, clearProps: 'transform,opacity',
    },
  );

  const hoy = contenedor.querySelector('.week-dot-circle.hoy');
  const latido = hoy
    ? gsap.to(hoy, {
      scale: 1.09,
      duration: 1.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: retraso + puntos.length * 0.05 + 0.3,
    })
    : null;

  const cerrar = blindar(tl);
  const dormir = latido ? ahorrarEnSegundoPlano(latido) : null;
  return () => { cerrar(); dormir?.(); };
}

/**
 * Un bloque que se anima cuando el scroll lo alcanza (las barras de Stats).
 * `alEntrar` recibe el elemento; si ya está a la vista, corre de inmediato.
 */
export function alAsomarse(el, alEntrar, opciones = {}) {
  if (!el) return undefined;
  if (sinMovimiento()) { alEntrar(el); return undefined; }
  const { inicio = 'top 88%' } = opciones;
  const disparador = ScrollTrigger.create({
    trigger: el,
    start: inicio,
    once: true,
    onEnter: () => alEntrar(el),
  });
  return () => disparador.kill();
}

/**
 * Barras de progreso (semana, kcal por tipo, equipo de hoy).
 *
 * GSAP es el dueño de estas medidas — por eso en el CSS ya no llevan
 * `transition`: dos motores animando la misma propiedad se pisan y el
 * resultado es un tirón. El porcentaje llega como número, no como estilo en
 * línea, para que al cambiar el valor la barra viaje desde donde estaba y
 * no desde cero.
 */
export function animarBarra(el, porcentaje, opciones = {}) {
  if (!el) return;
  const { propiedad = 'width', duracion = 1.1, retraso = 0, ease = EASE.springSoft } = opciones;
  const destino = `${Math.max(0, Math.min(100, porcentaje || 0))}%`;
  if (sinMovimiento()) { gsap.set(el, { [propiedad]: destino }); return; }
  gsap.to(el, { [propiedad]: destino, duration: duracion, delay: retraso, ease, overwrite: 'auto' });
}

/** Contador numérico. Devuelve el tween para poder matarlo al desmontar. */
export function contarHasta(desde, hasta, duracion, alActualizar, opciones = {}) {
  const { ease = 'power2.out', salto = 0 } = opciones;
  if (sinMovimiento()) { alActualizar(hasta); return null; }
  const proxy = { v: desde };
  return gsap.to(proxy, {
    v: hasta,
    duration: duracion,
    ease,
    ...(salto ? { snap: { v: salto } } : {}),
    onUpdate: () => alActualizar(proxy.v),
    onComplete: () => alActualizar(hasta),
  });
}

/**
 * Trazo de un SVG dibujándose (los palomeos de "misión cumplida").
 * También termina en el estado natural: si no corre, la palomita está
 * completa desde el principio.
 */
export function dibujarTrazo(contenedor, opciones = {}) {
  if (!contenedor || sinMovimiento()) return;
  const { duracion = 0.55, retraso = 0.15, cascada = 0.08, ease = 'power2.inOut' } = opciones;
  const trazos = contenedor.querySelectorAll('path, polyline, line');
  if (!trazos.length) return;
  gsap.fromTo(
    trazos,
    { drawSVG: '0%' },
    { drawSVG: '100%', duration: duracion, delay: retraso, ease, stagger: cascada },
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MICRO-INTERACCIONES — lo que responde al dedo
   ═══════════════════════════════════════════════════════════════════════ */

/** Micro-interacción "punch": el elemento late al tocarlo (reacciones, tabs). */
export function punch(el, escala = 1.25) {
  if (!el || reducido()) return;
  gsap.fromTo(el, { scale: 1 }, {
    scale: escala,
    duration: 0.16,
    ease: EASE.spring,
    yoyo: true,
    repeat: 1,
    transformOrigin: 'center',
    overwrite: 'auto',
    onComplete: () => gsap.set(el, { clearProps: 'transform' }),
  });
}

/** Aviso que pide atención sin gritar: tembleque corto y decreciente. */
export function sacudir(el, opciones = {}) {
  if (!el || reducido()) return;
  const { fuerza = 8, duracion = 0.7 } = opciones;
  gsap.fromTo(el, { x: 0 }, {
    x: fuerza,
    duration: duracion,
    ease: EASE.tembleque,
    overwrite: 'auto',
    onComplete: () => gsap.set(el, { clearProps: 'transform' }),
  });
}

/**
 * La llama de la racha. El CSS solo le bajaba la opacidad; una llama de
 * verdad además se estira y se ladea, y nunca repite el mismo ciclo — de
 * ahí `repeatRefresh` con valores al azar en cada vuelta.
 */
export function encenderLlama(el) {
  if (!el || reducido()) return undefined;
  const tl = gsap.timeline({ repeat: -1, repeatRefresh: true, defaults: { ease: 'sine.inOut' } })
    .to(el, {
      scaleY: () => gsap.utils.random(1.06, 1.2),
      scaleX: () => gsap.utils.random(0.92, 0.99),
      rotate: () => gsap.utils.random(-6, 6),
      opacity: () => gsap.utils.random(0.82, 1),
      duration: () => gsap.utils.random(0.28, 0.5),
      transformOrigin: '50% 100%',
    })
    .to(el, {
      scaleY: 1, scaleX: 1, rotate: 0, opacity: 1,
      duration: () => gsap.utils.random(0.24, 0.42),
    });
  return ahorrarEnSegundoPlano(tl);
}

/** Capa compartida para lo que se dibuja fuera del flujo (partículas, ondas). */
function capaEfimera() {
  const capa = document.createElement('div');
  capa.className = 'particulas-capa';
  capa.setAttribute('aria-hidden', 'true');
  document.body.appendChild(capa);
  return capa;
}

/**
 * Anillo que se expande desde el elemento tocado: confirma el toque con luz
 * en vez de con otro rebote. Se usa donde el gesto importa (chocar los
 * cinco, reaccionar, cerrar la semana).
 */
export function chispazo(el, opciones = {}) {
  if (!el || reducido()) return;
  const { color = 'var(--acc)', anillos = 2, tamano = 1 } = opciones;
  const r = el.getBoundingClientRect();
  const capa = capaEfimera();
  let vivos = anillos;
  for (let i = 0; i < anillos; i += 1) {
    const anillo = document.createElement('span');
    anillo.className = 'chispazo-anillo';
    anillo.style.borderColor = color;
    capa.appendChild(anillo);
    gsap.set(anillo, {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      width: r.width,
      height: r.height,
      xPercent: -50,
      yPercent: -50,
      opacity: 0.85,
      scale: 0.6,
    });
    gsap.to(anillo, {
      scale: (2.1 + i * 0.9) * tamano,
      opacity: 0,
      duration: 0.55 + i * 0.18,
      delay: i * 0.07,
      ease: 'power2.out',
      onComplete: () => { anillo.remove(); vivos -= 1; if (vivos === 0) capa.remove(); },
    });
  }
  setTimeout(() => capa.remove(), 1600);
}

/**
 * Explosión de partículas de emoji (estilo corazones de IG Live).
 *
 * Ahora salen disparadas con física de verdad (Physics2DPlugin): cada una
 * lleva su velocidad y su ángulo, y la MISMA gravedad las va frenando y
 * curvando. Antes viajaban en línea recta hasta un punto calculado, que es
 * lo que las delataba como CSS. Con la parábola se leen como algo lanzado.
 */
export function particulasEmoji(el, emoji, cantidad = 6) {
  if (!el || reducido()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const capa = capaEfimera();
  let vivas = cantidad;
  for (let i = 0; i < cantidad; i += 1) {
    const p = document.createElement('span');
    p.className = 'particula-emoji';
    p.textContent = emoji;
    capa.appendChild(p);
    gsap.set(p, { x: cx, y: cy, scale: gsap.utils.random(0.6, 1.15), opacity: 1 });
    const duracion = gsap.utils.random(0.85, 1.25);
    const retraso = i * 0.04;
    gsap.to(p, {
      duration: duracion,
      delay: retraso,
      ease: 'none',
      physics2D: {
        velocity: gsap.utils.random(210, 340),
        angle: gsap.utils.random(-118, -62),   // hacia arriba, en abanico
        gravity: 520,
      },
      rotation: gsap.utils.random(-50, 50),
    });
    gsap.to(p, {
      scale: gsap.utils.random(1.15, 1.7),
      duration: duracion * 0.45,
      delay: retraso,
      ease: 'power2.out',
    });
    gsap.to(p, {
      opacity: 0,
      duration: duracion * 0.5,
      delay: retraso + duracion * 0.5,
      ease: 'power1.in',
      onComplete: () => { p.remove(); vivas -= 1; if (vivas === 0) capa.remove(); },
    });
  }
  // Red de seguridad por si alguna animación se interrumpe (cambio de página)
  setTimeout(() => capa.remove(), 2400);
}

/* ═══════════════════════════════════════════════════════════════════════
   MOMENTOS — las escenas con guion
   ═══════════════════════════════════════════════════════════════════════ */

/** Apertura del lightbox: la foto entra con zoom elástico y el pie sube. */
export function abrirLightbox(img, caption) {
  if (sinMovimiento()) return;
  if (img) {
    gsap.fromTo(img, { scale: 0.82, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.6)' });
  }
  if (caption) {
    gsap.fromTo(caption, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, delay: 0.12, ease: 'power2.out' });
  }
}

/** Apertura del visor de avatar: zoom elástico de la foto + nombre. */
export function abrirAvatar(el, nombre) {
  if (sinMovimiento()) return;
  if (el) gsap.fromTo(el, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.8)' });
  if (nombre) gsap.fromTo(nombre, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, delay: 0.1, ease: 'power2.out' });
}

/**
 * El podio.
 *
 * El orden en pantalla es 2º — 1º — 3º, así que animarlos en el orden del
 * DOM dejaba al oro en medio de la cascada. Aquí se llaman por su lugar: la
 * plata, luego el bronce, y el oro AL FINAL, desde más abajo y con más
 * rebote. Después cae la corona y la medalla gira al aterrizar. El drama
 * está en el orden, no en la duración.
 */
export function entradaPodio(contenedor) {
  if (!contenedor || sinMovimiento()) return undefined;
  const cols = contenedor.querySelectorAll('.podium-col');
  if (!cols.length) return undefined;
  const porLugar = (n) => contenedor.querySelector(`.podium-col.p-${n}`);
  const secundarios = [porLugar(2), porLugar(3)].filter(Boolean);
  const oro = porLugar(1);

  const tl = gsap.timeline({ defaults: { ease: EASE.entrada } });

  if (secundarios.length) {
    tl.fromTo(
      secundarios,
      { y: 46, opacity: 0, scale: 0.9 },
      {
        y: 0, opacity: 1, scale: 1, duration: 0.65, ease: 'back.out(1.6)',
        stagger: 0.12, clearProps: 'transform,opacity',
      },
      0,
    );
  }
  if (oro) {
    tl.fromTo(
      oro,
      { y: 64, opacity: 0, scale: 0.86 },
      { y: 0, opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(2)', clearProps: 'transform,opacity' },
      0.26,
    );
  }

  // La base crece desde el suelo: es un pedestal, no una tarjeta.
  const bases = contenedor.querySelectorAll('.podium-base');
  if (bases.length) {
    tl.fromTo(
      bases,
      { scaleY: 0.15, transformOrigin: '50% 100%' },
      { scaleY: 1, duration: 0.55, ease: EASE.springSoft, stagger: 0.08, clearProps: 'transform' },
      0.3,
    );
  }

  const medallas = contenedor.querySelectorAll('.podium-medal');
  if (medallas.length) {
    tl.fromTo(
      medallas,
      { rotateY: -180, scale: 0.5, opacity: 0 },
      {
        rotateY: 0, scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.8)',
        stagger: 0.1, clearProps: 'transform,opacity',
      },
      0.52,
    );
  }

  const corona = contenedor.querySelector('.podium-crown');
  let flotar;
  if (corona) {
    tl.fromTo(
      corona,
      { y: -32, opacity: 0, rotate: -24, scale: 0.7 },
      { y: 0, opacity: 1, rotate: 0, scale: 1, duration: 0.75, ease: 'bounce.out' },
      0.78,
    );
    // Y después se queda flotando. Esto lo hacía el CSS con `float-y`, pero
    // una animación CSS le gana a los estilos en línea de GSAP: mientras
    // estuvo puesta, la corona nunca llegó a caer — se veía aparecer.
    flotar = gsap.to(corona, {
      y: -4, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.6,
    });
  }

  const cerrar = blindar(tl);
  const dormir = flotar ? ahorrarEnSegundoPlano(flotar) : null;
  return () => { cerrar(); dormir?.(); };
}

/** Entrada del banner de instalación: se asoma desde abajo con rebote suave. */
export function entradaBanner(el) {
  if (!el || sinMovimiento()) return;
  gsap.fromTo(el, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: 'back.out(1.4)' });
}

/** Salida del banner (devuelve una promesa para desmontar después). */
export function salidaBanner(el) {
  if (!el || reducido()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.to(el, { y: 110, opacity: 0, duration: 0.35, ease: EASE.salida, onComplete: resolve });
  });
}

/**
 * La celebración de después de registrar el día — el momento que la gente
 * va a ver todos los días, así que es el que más se cuidó.
 *
 * El guion: el disco aterriza girando y suelta una onda; el titular entra
 * palabra por palabra; las cifras y la semana llegan detrás; los botones al
 * final, cuando ya leíste. Cada pieza arranca ANTES de que termine la
 * anterior: así son cuatro compases y no cuatro animaciones en fila.
 */
export function entradaCelebracion(overlay) {
  if (!overlay || sinMovimiento()) return undefined;
  const icono = overlay.querySelector('.celebra-icono');
  const titulo = overlay.querySelector('.celebra-titulo');
  const bloques = overlay.querySelectorAll('.celebra-anim:not(.celebra-titulo)');
  // La semana no se anima aquí: la enciende el propio WeekDots al montarse,
  // con el retraso que le pasa la celebración. Un solo dueño por elemento.

  const tl = gsap.timeline({ defaults: { ease: EASE.entrada } });

  if (icono) {
    tl.fromTo(
      icono,
      { scale: 0, rotate: -35 },
      { scale: 1, rotate: 0, duration: 0.75, ease: 'back.out(2.4)' },
      0,
    );
    // La onda sale cuando el disco ya aterrizó, no mientras cae.
    tl.call(() => chispazo(icono, { anillos: 2, tamano: 1.15 }), null, 0.42);
  }

  let particion;
  if (titulo) {
    particion = SplitText.create(titulo, { type: 'words' });
    tl.from(particion.words, { yPercent: 60, opacity: 0, duration: 0.5, stagger: 0.06 }, 0.3);
  }

  if (bloques.length) {
    tl.fromTo(
      bloques,
      { y: 26, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.09, clearProps: 'transform,opacity' },
      0.42,
    );
  }

  const cerrar = blindar(tl);
  return () => { cerrar(); particion?.revert(); };
}

/**
 * Intro cinemática de bienvenida (estilo anime).
 *
 * Antes eran cinco `@keyframes` de CSS corriendo en paralelo y confiando en
 * que coincidieran. Aquí es UNA línea de tiempo: el corte de luz, el
 * impacto del nombre letra por letra, el rebote del bloque y el fundido de
 * salida caen donde deben porque están en la misma regla.
 *
 * `alTerminar` se dispara al cerrar el telón, pero quien manda es el
 * temporizador de quien la monta: la animación decora, el reloj garantiza
 * que nadie se quede encerrado en la intro.
 */
export function introCinematica(raiz, alTerminar) {
  if (!raiz) return undefined;
  const titulo = raiz.querySelector('.anime-title');
  const subtitulo = raiz.querySelector('.anime-subtitle');
  const corte = raiz.querySelector('.anime-slash');
  const lineas = raiz.querySelector('.anime-bg-lines');
  const contenido = raiz.querySelector('.anime-content');

  if (sinMovimiento()) {
    gsap.set([titulo, subtitulo].filter(Boolean), { opacity: 1, clipPath: 'none' });
    return undefined;
  }

  // El CSS trae su propia versión de esta intro para el caso reducido; con
  // GSAP al mando se apaga, para que no peleen por las mismas propiedades.
  raiz.classList.add('intro-js');

  const particion = titulo ? SplitText.create(titulo, { type: 'chars,words' }) : null;
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  if (lineas) {
    tl.fromTo(lineas, { opacity: 0, scale: 1.35 }, { opacity: 0.4, scale: 1, duration: 0.7, ease: 'power2.out' }, 0);
    tl.to(lineas, { rotate: 360, duration: 26, ease: 'none', repeat: -1 }, 0);
  }

  if (corte) {
    // Giro y sesgo explícitos en los dos extremos: el CSS deja el corte en
    // `rotate(-10deg) scaleX(0)` y de una matriz con escala cero el giro ya
    // no se puede recuperar — GSAP lo leía como un sesgo de -10°, le sumaba
    // el rotate y el tajo salía al DOBLE de inclinación. Lo cazó el banco.
    tl.fromTo(
      corte,
      { scaleX: 0, rotate: -10, skewX: 0, transformOrigin: 'left center', opacity: 1 },
      { scaleX: 1, rotate: -10, skewX: 0, duration: 0.26, ease: 'power4.in' },
      0.08,
    )
      .set(corte, { transformOrigin: 'right center' }, 0.34)
      .to(corte, { scaleX: 0, opacity: 0, duration: 0.32, ease: 'power2.out' }, 0.34);
  }

  if (particion) {
    tl.fromTo(
      particion.chars,
      { opacity: 0, scale: 2.6, y: 18, rotate: () => gsap.utils.random(-14, 14) },
      {
        opacity: 1, scale: 1, y: 0, rotate: 0,
        duration: 0.55, ease: 'back.out(1.9)', stagger: 0.035,
      },
      0.3,
    );
  }
  if (contenido) {
    // El golpe: el bloque entero se comprime un instante al aterrizar.
    // `skewY` explícito por lo mismo: el bloque viene inclinado desde el CSS
    // y sin decírselo a GSAP se enderezaría al primer fotograma.
    tl.fromTo(contenido, { scale: 1.07, skewY: -6 }, { scale: 1, skewY: -6, duration: 0.55, ease: 'elastic.out(1, 0.5)' }, 0.6);
  }

  if (subtitulo) {
    tl.fromTo(
      subtitulo,
      { opacity: 1, clipPath: 'inset(0 100% 0 0)', x: -18 },
      { clipPath: 'inset(0 -10% 0 -10%)', x: 0, duration: 0.6, ease: 'power3.inOut' },
      0.95,
    );
  }

  // Telón: la pantalla se va hacia adelante, como un corte de cámara.
  tl.to(raiz, { opacity: 0, scale: 1.06, duration: 0.6, ease: 'power2.in', onComplete: alTerminar }, 2.75);

  const cerrar = blindar(tl);
  return () => { cerrar(); particion?.revert(); };
}

/**
 * La pastilla que sigue a la pestaña activa en la barra inferior.
 *
 * Es UN elemento que viaja, no seis fondos que se encienden: por eso la
 * navegación se lee como un objeto que se mueve y no como un parpadeo. Se
 * aplasta al salir y recupera la forma al llegar — squash & stretch de
 * toda la vida, en 45 centésimas.
 */
export function moverIndicadorTabs(pastilla, activo, instantaneo = false) {
  if (!pastilla || !activo) return;
  const padre = pastilla.parentElement;
  if (!padre) return;
  const r = activo.getBoundingClientRect();
  const rp = padre.getBoundingClientRect();
  if (!r.width) return;
  const destino = {
    x: r.left - rp.left,
    y: r.top - rp.top,
    width: r.width,
    height: r.height,
    opacity: 1,
  };
  if (instantaneo || sinMovimiento()) { gsap.set(pastilla, destino); return; }
  gsap.to(pastilla, { ...destino, duration: 0.45, ease: EASE.springSoft, overwrite: 'auto' });
  gsap.fromTo(
    pastilla,
    { scaleY: 0.82, scaleX: 1.05 },
    { scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.55)', overwrite: 'auto' },
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FLIP — listas que se reordenan
   ═══════════════════════════════════════════════════════════════════════ */

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
    duration: 0.65,
    ease: EASE.springSoft,
    stagger: 0.02,
    onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.4 }),
    onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.25 }),
  });
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

  // Avisa que entró aire: los pétalos de cempasúchil (petalosDeCempasuchil)
  // se dejan llevar por la MISMA ráfaga que mueve la guirnalda. Un evento y
  // no una importación, para que el papel picado no sepa quién lo escucha.
  rafaga.call(() => window.dispatchEvent(new Event('rgf-rafaga')), null, 0);

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

/* ═══════════════════════════════════════════════════════════════════════
   TEMPORADA DE BRUJAS Y MUERTOS — 1 de octubre al 2 de noviembre
   Dos variantes que elige cada quien (config/temporada.js). Todo lo de
   aquí pausa con la pantalla apagada y se queda quieto con menos movimiento.
   ═══════════════════════════════════════════════════════════════════════ */

const azarT = (a, b) => a + Math.random() * (b - a);

/** Lienzo a la medida de su caja y nítido en pantallas densas. */
function lienzoNitido(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const tam = { ancho: 0, alto: 0 };
  const redimensionar = () => {
    tam.ancho = canvas.clientWidth;
    tam.alto = canvas.clientHeight;
    canvas.width = Math.round(tam.ancho * dpr);
    canvas.height = Math.round(tam.alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  redimensionar();
  window.addEventListener('resize', redimensionar);
  return { ctx, tam, soltar: () => window.removeEventListener('resize', redimensionar) };
}

/* ── Noche de brujas ─────────────────────────────────────────────────── */

/**
 * Un murciélago visto de frente, dibujado en el origen. `aleteo` va de -1
 * (alas abajo) a 1 (alas arriba).
 *
 * Lo que lo hace leerse como murciélago y no como pájaro: el borde de fuga
 * del ala va FESTONEADO —la membrana se mete entre dedo y dedo— y en los
 * extremos del aleteo el ala se acorta, porque se ve en escorzo.
 */
function dibujarMurcielago(ctx, s, aleteo) {
  const alto = -aleteo * s * 0.5;
  const abre = s * (0.78 + 0.22 * (1 - Math.abs(aleteo)));
  ctx.beginPath();
  ctx.ellipse(0, s * 0.02, s * 0.11, s * 0.2, 0, 0, Math.PI * 2);
  ctx.moveTo(-s * 0.1, -s * 0.08);
  ctx.lineTo(-s * 0.09, -s * 0.3);
  ctx.lineTo(-s * 0.02, -s * 0.14);
  ctx.lineTo(s * 0.02, -s * 0.14);
  ctx.lineTo(s * 0.09, -s * 0.3);
  ctx.lineTo(s * 0.1, -s * 0.08);
  ctx.closePath();
  [-1, 1].forEach((lado) => {
    const px = lado * abre;
    const py = alto;
    const bx = lado * s * 0.06;
    const by = s * 0.16;
    ctx.moveTo(lado * s * 0.08, -s * 0.06);
    ctx.quadraticCurveTo(lado * abre * 0.5, alto * 0.6 - s * 0.16, px, py);
    for (let i = 1; i <= 3; i += 1) {
      const x0 = px + (bx - px) * ((i - 1) / 3);
      const y0 = py + (by - py) * ((i - 1) / 3);
      const x1 = px + (bx - px) * (i / 3);
      const y1 = py + (by - py) * (i / 3);
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - s * 0.13, x1, y1);
    }
    ctx.closePath();
  });
  ctx.fill();
}

/**
 * Murciélagos que cruzan la pantalla.
 *
 * Cada uno es un pequeño simulador, no una ruta fija:
 *
 *   · VUELO ERRÁTICO — corrigen el rumbo a cada rato (el zigzag de un
 *     murciélago cazando), así que dos vuelos nunca son iguales.
 *   · EL GOLPE DE ALA ES ASIMÉTRICO — bajan las alas más rápido de lo que
 *     las suben, y el cuerpo sube con cada golpe. Sin eso aletean como
 *     mariposa.
 *   · PLANEAN — de vez en cuando dejan de aletear con las alas abiertas.
 *   · PROFUNDIDAD — los lejanos son chicos, lentos, más tenues y aletean
 *     más rápido; los cercanos al revés.
 *
 * `noche` (31 de octubre): sale una bandada de la luna y los vuelos se
 * vuelven frecuentes. `origen` cambia de dónde sale esa bandada.
 *
 * El color sale del CSS (`color` del lienzo), así cada tema pone el suyo.
 * Mientras no vuela ninguno, el lienzo ni se toca. Devuelve la baja.
 */
export function vuelosDeMurcielagos(canvas, { noche = false, origen = null } = {}) {
  if (!canvas || reducido()) return () => {};
  const { ctx, tam, soltar } = lienzoNitido(canvas);
  const bandada = [];
  let sucio = false;

  const nuevo = (op = {}) => {
    const lado = op.lado ?? (Math.random() < 0.5 ? -1 : 1);
    const prof = op.prof ?? Math.random();
    const s = 10 + prof * 16;
    bandada.push({
      x: op.x ?? (lado < 0 ? -s * 2 : tam.ancho + s * 2),
      y: op.y ?? tam.alto * azarT(0.05, 0.42),
      vx: op.vx ?? -lado * (1.3 + prof * 1.9),
      vy: op.vy ?? azarT(-0.3, 0.3),
      s,
      prof,
      fase: azarT(0, Math.PI * 2),
      ritmo: azarT(0.24, 0.32) * (1.3 - prof * 0.45),
      deriva: azarT(0, 200),
      planea: 0,
      t: 0,
      col: getComputedStyle(canvas).color,
    });
  };

  // Un grupito que entra por el mismo lado, con un poco de desorden.
  const grupo = () => {
    const lado = Math.random() < 0.5 ? -1 : 1;
    const y = tam.alto * azarT(0.06, 0.36);
    const n = noche ? gsap.utils.random(2, 5, 1) : gsap.utils.random(1, 3, 1);
    for (let i = 0; i < n; i += 1) {
      nuevo({ lado, y: y + azarT(-40, 40), x: (lado < 0 ? -30 : tam.ancho + 30) - lado * i * azarT(20, 55) });
    }
  };

  // La bandada que sale de la luna: hacia abajo y a los lados, en abanico.
  const estampida = () => {
    const ox = origen?.x ?? tam.ancho * 0.58;
    const oy = origen?.y ?? 24;
    for (let i = 0; i < 16; i += 1) {
      const ang = azarT(0.12, Math.PI - 0.12);
      const vel = azarT(1.6, 3.4);
      nuevo({
        x: ox + azarT(-12, 12), y: oy + azarT(-6, 6), vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel * 0.55, prof: azarT(0.2, 1),
      });
    }
  };

  const llamadas = [];
  const programar = (seg, fn) => { llamadas.push(gsap.delayedCall(seg, fn)); };
  const siguiente = () => {
    programar(noche ? azarT(3.5, 7) : azarT(9, 18), () => { if (!document.hidden) grupo(); siguiente(); });
  };
  if (noche) programar(0.6, estampida);
  programar(noche ? 2.4 : 2.5, () => { grupo(); siguiente(); });

  const tick = () => {
    if (document.hidden) return;
    if (!bandada.length) {
      if (sucio) { ctx.clearRect(0, 0, tam.ancho, tam.alto); sucio = false; }
      return;
    }
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
    sucio = true;
    for (let i = bandada.length - 1; i >= 0; i -= 1) {
      const b = bandada[i];
      b.t += 1;
      b.vy += Math.sin((b.t + b.deriva) * 0.05) * 0.04 + azarT(-0.025, 0.025);
      b.vy *= 0.975;
      if (b.planea > 0) b.planea -= 1;
      else if (Math.random() < 0.004) b.planea = gsap.utils.random(24, 50, 1);
      if (!b.planea) b.fase += b.ritmo * (Math.cos(b.fase) < 0 ? 1.35 : 0.78);
      const aleteo = b.planea ? -0.2 : Math.sin(b.fase);
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < -80 || b.x > tam.ancho + 80 || b.y < -80 || b.y > tam.alto + 80) {
        bandada.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(b.x, b.y + aleteo * b.s * 0.08);
      ctx.rotate(Math.max(-0.5, Math.min(0.5, b.vy * 0.22)) + b.vx * 0.02);
      ctx.globalAlpha = 0.5 + b.prof * 0.45;
      ctx.fillStyle = b.col;
      dibujarMurcielago(ctx, b.s, aleteo);
      ctx.restore();
    }
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    llamadas.forEach((c) => c.kill());
    soltar();
    bandada.length = 0;
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
  };
}

/**
 * La noche entra: la luna sube un poco y aclara, la niebla se asienta y la
 * telaraña se teje hilo por hilo (primero los radios, luego la espiral, que
 * es como la teje la araña). Todo parte de lo que ya se ve: si no corre, la
 * escena simplemente está ahí.
 */
export function amanecerNocheDeLuna(raiz) {
  if (!raiz || sinMovimiento()) return undefined;
  const tl = gsap.timeline();
  const luna = raiz.querySelector('.nl-luna');
  if (luna) tl.from(luna, { y: 26, opacity: 0, duration: 1.6, ease: 'power3.out' }, 0);
  const nieblas = raiz.querySelectorAll('[data-niebla]');
  if (nieblas.length) tl.from(nieblas, { opacity: 0, duration: 2, ease: 'power1.out', stagger: 0.3 }, 0.2);
  const radios = raiz.querySelectorAll('[data-radio]');
  if (radios.length) tl.from(radios, { drawSVG: 0, duration: 0.7, ease: 'power2.out', stagger: 0.07 }, 0.3);
  const espiral = raiz.querySelectorAll('[data-espiral]');
  if (espiral.length) tl.from(espiral, { drawSVG: 0, duration: 0.5, ease: 'power1.inOut', stagger: 0.08 }, '>-0.2');
  return blindar(tl);
}

/**
 * La niebla corre despacio. Cada banda mide el doble de la pantalla y su
 * dibujo se repite a la mitad, así que recorrerla media vuelta y empezar
 * otra no deja costura. Sin `filter: blur`: con degradados suaves movidos
 * por transform ya se lee como niebla, y el desenfoque de una capa fija de
 * pantalla completa es justo lo que hace tartamudear a un Android de gama
 * media.
 */
export function nieblaNocturna(raiz) {
  if (!raiz || reducido()) return undefined;
  const anims = [];
  raiz.querySelectorAll('[data-niebla]').forEach((banda, i) => {
    const izq = i % 2 === 0;
    anims.push(gsap.fromTo(
      banda,
      { xPercent: izq ? 0 : -50 },
      { xPercent: izq ? -50 : 0, duration: Number(banda.dataset.niebla) || 60, ease: 'none', repeat: -1 },
    ));
    anims.push(gsap.to(banda, { y: i % 2 ? -7 : 7, duration: 6 + i * 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  });
  const tela = raiz.querySelector('[data-tela]');
  // La telaraña respira con el aire: un grado basta.
  if (tela) anims.push(gsap.to(tela, { rotation: -1, svgOrigin: '160 0', duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  return ahorrarEnSegundoPlano(...anims);
}

/**
 * Una araña que baja de su telaraña por el hilo, rebota, se mece y vuelve a
 * subir a tirones.
 *
 * La altura es UNA variable (--caida) que usan el hilo y el cuerpo, así que
 * los dos nunca se separan. El rebote es el hilo estirándose: baja de más y
 * regresa con un elástico. La subida va a tirones porque así trepa una
 * araña de verdad: jala, se detiene, vuelve a jalar.
 *
 * Vive en el canal del borde derecho, fuera de las tarjetas y lejos de los
 * botones de la cabecera.
 */
export function bajarArana(arana) {
  if (!arana || reducido()) return undefined;
  const patas = arana.querySelectorAll('[data-pata]');
  // Cinco jalones con pausa entre uno y otro, en una sola curva.
  const jalon = gsap.parseEase('power2.inOut');
  const tirones = (t) => {
    const n = 5;
    const k = Math.min(Math.floor(t * n), n - 1);
    const f = t * n - k;
    return (k + (f < 0.62 ? jalon(f / 0.62) : 1)) / n;
  };

  // La caída se anima en un objeto y se copia a la variable en cada cuadro:
  // así los rebotes pueden ser relativos (+=, -=) a una bajada que cambia
  // de largo en cada vuelta.
  const hilo = { caida: 0 };
  const pintar = () => arana.style.setProperty('--caida', `${hilo.caida.toFixed(1)}px`);
  pintar();
  gsap.set(arana, { rotation: 0, transformOrigin: '50% 0%' });
  const tl = gsap.timeline({ repeat: -1, repeatRefresh: true, delay: 2.2, onUpdate: pintar })
    .to(hilo, { caida: () => Math.round(azarT(110, 200)), duration: 2.6, ease: 'power2.out' })
    .to(patas, {
      rotation: (i) => (i % 2 ? 9 : -9), svgOrigin: '12 12', duration: 0.18, ease: 'sine.inOut', yoyo: true, repeat: 5,
    }, '<0.3')
    .to(hilo, { caida: '+=14', duration: 0.32, ease: 'sine.out' })
    .to(hilo, { caida: '-=14', duration: 1.5, ease: 'elastic.out(1, 0.32)' })
    .to(arana, { rotation: 5, duration: 1, ease: 'sine.inOut' }, '<0.15')
    .to(arana, { rotation: -3.5, duration: 1.5, ease: 'sine.inOut' })
    .to(arana, { rotation: 1.8, duration: 1.3, ease: 'sine.inOut' })
    .to(arana, { rotation: 0, duration: 1.2, ease: 'sine.out' })
    .to({}, { duration: () => azarT(1.2, 3) })
    .to(hilo, { caida: 0, duration: 3.4, ease: tirones })
    .to(patas, {
      rotation: (i) => (i % 2 ? -12 : 12), svgOrigin: '12 12', duration: 0.12, ease: 'sine.inOut', yoyo: true, repeat: 13,
    }, '<')
    .to({}, { duration: () => azarT(7, 16) });

  return ahorrarEnSegundoPlano(tl);
}

/**
 * Apaga (o vuelve a encender) los planos de una escena de temporada: todo lo
 * que lleve `data-capa`. Se usa al cambiar de variante o apagar el tema; si
 * alguien se arrepiente a media salida, `saliendo = false` la regresa.
 */
export function retirarTemporada(raiz, saliendo = true) {
  if (!raiz) return;
  const capas = raiz.querySelectorAll('[data-capa]');
  if (!capas.length) return;
  if (reducido()) { gsap.set(capas, { opacity: saliendo ? 0 : 1 }); return; }
  gsap.to(capas, {
    opacity: saliendo ? 0 : 1, duration: saliendo ? 0.55 : 0.8, ease: saliendo ? 'power2.in' : 'power2.out', overwrite: true,
  });
}

/**
 * La calabaza se enciende como se enciende una vela: el cerillo chispea dos
 * veces antes de prender, y luego la flama titila sin repetirse nunca igual.
 * `encendida = false` la apaga. Devuelve la baja del titileo.
 */
export function encenderCalabaza(svg, encendida = true) {
  if (!svg) return undefined;
  const luz = svg.querySelectorAll('[data-luz]');
  if (!luz.length) return undefined;
  if (!encendida) {
    gsap.to(luz, { opacity: 0, duration: reducido() ? 0 : 0.35, ease: 'power2.out', overwrite: true });
    return undefined;
  }
  if (reducido()) { gsap.set(luz, { opacity: 1 }); return undefined; }
  const tl = gsap.timeline()
    .to(luz, { opacity: 0.75, duration: 0.05, overwrite: true })
    .to(luz, { opacity: 0.08, duration: 0.09 })
    .to(luz, { opacity: 0.9, duration: 0.05 })
    .to(luz, { opacity: 0.25, duration: 0.12 })
    .to(luz, { opacity: 1, duration: 0.4, ease: 'power2.out' });
  const titileo = gsap.to(luz, {
    opacity: () => azarT(0.7, 1),
    duration: () => azarT(0.06, 0.24),
    ease: 'sine.inOut',
    repeat: -1,
    repeatRefresh: true,
    delay: tl.duration(),
  });
  const parar = ahorrarEnSegundoPlano(titileo);
  return () => { tl.kill(); parar(); };
}

/**
 * El cempasúchil abre en espiral: los pétalos se despliegan uno tras otro
 * alrededor del centro, con un pequeño giro que los acomoda. Cerrado queda
 * en botón. Abierto, respira. Devuelve la baja de la respiración.
 */
export function abrirCempasuchil(svg, abierta = true) {
  if (!svg) return undefined;
  const petalos = svg.querySelectorAll('[data-petalo]');
  const flor = svg.querySelector('[data-flor]');
  if (!petalos.length) return undefined;
  gsap.set(petalos, { svgOrigin: '0 0' });
  if (reducido()) {
    gsap.set(petalos, { scale: abierta ? 1 : 0.62, rotation: 0 });
    return undefined;
  }
  if (!abierta) {
    gsap.to(petalos, {
      scale: 0.62, rotation: -10, duration: 0.5, ease: 'power2.inOut', stagger: { each: 0.004 }, overwrite: true,
    });
    return undefined;
  }
  const tl = gsap.timeline()
    .fromTo(petalos, { scale: 0.62, rotation: -18 }, {
      scale: 1, rotation: 0, duration: 0.85, ease: 'back.out(1.8)', stagger: { each: 0.016 }, overwrite: true,
    });
  const respira = flor
    ? gsap.to(flor, { rotation: 4, svgOrigin: '48 44', duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1 })
    : null;
  const parar = respira ? ahorrarEnSegundoPlano(respira) : () => {};
  return () => {
    // Si se cierra a media apertura, que no se quede a medias.
    if (tl.progress() < 1) tl.progress(1);
    parar();
    if (flor) gsap.set(flor, { rotation: 0 });
  };
}

/** Entrada de los emblemas del modal: se trazan y luego se rellenan. */
export function trazarEmblemasTemporada(raiz) {
  if (!raiz || sinMovimiento()) return undefined;
  const tl = gsap.timeline();
  const trazos = raiz.querySelectorAll('[data-trazo]');
  if (trazos.length) tl.from(trazos, { drawSVG: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.05 }, 0);
  const rellenos = raiz.querySelectorAll('[data-relleno]');
  if (rellenos.length) {
    tl.from(rellenos, {
      opacity: 0, scale: 0.86, transformOrigin: '50% 100%', duration: 0.7, ease: 'power3.out', stagger: 0.04,
    }, 0.25);
  }
  return blindar(tl);
}

/* ── Día de Muertos ──────────────────────────────────────────────────── */

/** Pétalo de cempasúchil: borde rizado arriba, angosto en la base (10×14). */
const PETALO_CEMPASUCHIL = 'M5 14 C3 11 0 7 0.6 3.2 C1.2 1.2 2.4 0.4 3.2 1.4 C3.8 0.2 4.6 -0.2 5 1 '
  + 'C5.4 -0.2 6.2 0.2 6.8 1.4 C7.6 0.4 8.8 1.2 9.4 3.2 C10 7 7 11 5 14 Z';

/**
 * Pétalos de cempasúchil que caen: el camino de flor que se le pone a las
 * almas para que encuentren la ofrenda.
 *
 *   · DAN VUELTAS AL CAER — se aplanan y se abren (escala vertical con el
 *     coseno de su giro), como un pétalo de verdad que se ve de canto. Es lo
 *     que separa un pétalo de un confeti.
 *   · SE MECEN — cada uno con su vaivén y su ritmo.
 *   · EL VIENTO ES EL MISMO DE LA GUIRNALDA — cuando una ráfaga sacude el
 *     papel picado (evento 'rgf-rafaga'), los pétalos se van de lado con
 *     ella. La escena se mueve como una sola cosa, no como dos efectos.
 *
 * `abundancia` multiplica cuántos caen a la vez (1 y 2 de noviembre, más).
 * Devuelve la baja.
 */
export function petalosDeCempasuchil(canvas, { abundancia = 1 } = {}) {
  if (!canvas || reducido() || typeof Path2D === 'undefined') return () => {};
  const { ctx, tam, soltar } = lienzoNitido(canvas);
  const forma = new Path2D(PETALO_CEMPASUCHIL);
  const nervio = new Path2D('M5 12.6 L5 3.6');
  const COLORES = ['#ffae1a', '#ff8a00', '#ffc23d', '#f97316', '#ff9f1c'];
  const cuantos = Math.round(10 * abundancia);
  const petalos = [];
  let viento = 0;

  const nuevo = (y) => {
    const prof = Math.random();
    return {
      x: azarT(-20, tam.ancho + 20),
      y,
      prof,
      s: 7 + prof * 9,
      vy: 0.32 + prof * 0.5,
      giro: azarT(0, Math.PI * 2),
      vgiro: azarT(-0.025, 0.025),
      vuelta: azarT(0, Math.PI * 2),
      vvuelta: azarT(0.018, 0.05),
      vaiven: azarT(0, Math.PI * 2),
      vvaiven: azarT(0.008, 0.02),
      ampl: azarT(0.25, 0.8),
      col: COLORES[Math.floor(Math.random() * COLORES.length)],
    };
  };
  // Nacen arriba, escalonados: la pantalla se va llenando, no aparece llena.
  for (let i = 0; i < cuantos; i += 1) petalos.push(nuevo(azarT(-tam.alto * 0.9, -12)));

  const alViento = () => { viento = Math.min(viento + 1.5, 2.6); };
  window.addEventListener('rgf-rafaga', alViento);

  const tick = () => {
    if (document.hidden) return;
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
    viento *= 0.984;
    petalos.forEach((p, i) => {
      p.vaiven += p.vvaiven;
      p.vuelta += p.vvuelta;
      p.giro += p.vgiro + viento * 0.006;
      p.x += Math.sin(p.vaiven) * p.ampl + viento * (0.5 + p.prof);
      p.y += p.vy * (0.75 + Math.abs(Math.cos(p.vuelta)) * 0.5);
      if (p.y > tam.alto + 24 || p.x > tam.ancho + 40 || p.x < -40) {
        petalos[i] = nuevo(azarT(-60, -14));
        return;
      }
      const escala = p.s / 14;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(escala, escala * Math.max(0.12, Math.abs(Math.cos(p.vuelta))));
      ctx.translate(-5, -7);
      ctx.globalAlpha = 0.6 + p.prof * 0.38;
      ctx.fillStyle = p.col;
      ctx.fill(forma);
      ctx.globalAlpha *= 0.45;
      ctx.strokeStyle = '#a64b00';
      ctx.lineWidth = 0.7;
      ctx.stroke(nervio);
      ctx.restore();
    });
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('rgf-rafaga', alViento);
    soltar();
    petalos.length = 0;
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
  };
}
