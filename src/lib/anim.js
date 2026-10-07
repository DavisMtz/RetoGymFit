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
 * La bruja en su escoba, de perfil y mirando a la derecha, dibujada en el
 * origen (unas 110 × 60 unidades). `t` mueve lo único que ondea con el aire:
 * la capa, el pelo y las cerdas de la escoba.
 *
 * Es una silueta, así que se lee por tres rasgos y por eso van exagerados:
 * el sombrero con la punta doblada hacia atrás, la nariz y la escoba.
 */
function dibujarBruja(ctx, t) {
  const a = Math.sin(t * 0.21);
  const b = Math.sin(t * 0.21 + 1.3);
  // Cada pieza se rellena por separado: en un solo trazo, las que se
  // enciman girando al revés se anulan y la silueta queda con huecos.
  ctx.beginPath();
  // El palo, un pelo más grueso atrás.
  ctx.moveTo(-44, 4.6);
  ctx.lineTo(42, -5.4);
  ctx.lineTo(42.4, -3.4);
  ctx.lineTo(-44, 7.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // Las cerdas: un manojo que se abre hacia atrás y aletea.
  ctx.moveTo(-38, 3);
  ctx.quadraticCurveTo(-52, -1 + a * 1.2, -64, -3.5 + a * 2);
  ctx.quadraticCurveTo(-59, 2.5, -68, 5 + b * 1.6);
  ctx.quadraticCurveTo(-58, 8, -64, 13.5 + a * 1.8);
  ctx.quadraticCurveTo(-50, 11, -38, 9.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // La capa: sale de los hombros y ondea hacia atrás.
  ctx.moveTo(4, -21);
  ctx.bezierCurveTo(-8, -22 + a * 2, -22, -18 + b * 3, -34, -12 + a * 3.6);
  ctx.quadraticCurveTo(-24, -9 + b * 2, -28, -3.5 + a * 2.6);
  ctx.quadraticCurveTo(-14, -3, -6, 1.5);
  ctx.lineTo(2, -8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // El cuerpo sentado: torso, regazo, la pierna y la bota hacia adelante.
  ctx.moveTo(3, -21);
  ctx.quadraticCurveTo(12, -20, 14, -11);
  ctx.lineTo(16, -1.5);
  ctx.lineTo(25, 0.5);
  ctx.lineTo(29, 9);
  ctx.lineTo(35.5, 9.4);
  ctx.lineTo(35.5, 12.2);
  ctx.lineTo(26, 12.2);
  ctx.lineTo(20, 4.5);
  ctx.lineTo(6, 3.5);
  ctx.lineTo(-7, 2);
  ctx.quadraticCurveTo(-6, -12, 3, -21);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // El brazo que va a la escoba.
  ctx.moveTo(6.5, -18.5);
  ctx.lineTo(24, -4.8);
  ctx.lineTo(25.4, -2.4);
  ctx.lineTo(8.4, -15);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // Cabeza y nariz.
  ctx.moveTo(13.6, -25.5);
  ctx.arc(9, -25.5, 4.6, 0, Math.PI * 2);
  ctx.moveTo(12.6, -27.2);
  ctx.lineTo(18.6, -24.4);
  ctx.lineTo(12.6, -23.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // El pelo suelto.
  ctx.moveTo(6, -27);
  ctx.quadraticCurveTo(-2, -26 + b, -8, -20.5 + a * 1.6);
  ctx.quadraticCurveTo(-1, -22, 5, -21.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  // El sombrero: ala ancha y una punta que se dobla hacia atrás.
  ctx.moveTo(-4, -29.2);
  ctx.quadraticCurveTo(8, -32.8, 21, -30);
  ctx.quadraticCurveTo(9, -28.2, -4, -29.2);
  ctx.closePath();
  ctx.moveTo(1.5, -30.4);
  ctx.quadraticCurveTo(3.5, -40, -7, -47.5 + a * 0.8);
  ctx.quadraticCurveTo(6.5, -42, 14.5, -30.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * Un destello suave pintado una vez y reutilizado en cada chispa. En oscuro
 * lleva el corazón blanco (la luz se suma); en claro, del mismo color, porque
 * sobre fondo claro un centro blanco desaparece y deja un aro sucio.
 */
function crearDestello(color, nucleo = '#ffffff') {
  const lado = 32;
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const c = lienzo.getContext('2d');
  const g = c.createRadialGradient(lado / 2, lado / 2, 0, lado / 2, lado / 2, lado / 2);
  g.addColorStop(0, nucleo);
  g.addColorStop(0.18, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, lado, lado);
  return lienzo;
}

/**
 * Lo que vuela por delante de la app: murciélagos y, de vez en cuando, la
 * bruja cruzando la luna.
 *
 * MURCIÉLAGOS EN PARVADA. Cada grupo es una bandada de verdad (separación,
 * alineación y cohesión, más un rumbo de grupo que se va curvando): nadie
 * vuela por una ruta fija y los grupos se abren, se cierran y se reacomodan
 * solos. Encima de eso, lo que los hace murciélagos: corrigen el rumbo a
 * tirones, el golpe de ala baja más rápido de lo que sube y a ratos planean.
 * Los que salen de la luna nacen lejos —chicos y tenues— y se van acercando.
 *
 * LA BRUJA. Cruza por la franja de cielo siguiendo una curva que pasa
 * EXACTAMENTE por el centro de la luna: con una cuadrática, el punto de
 * control que lo garantiza es 2·luna − (inicio + fin)/2. La recorre a
 * velocidad constante (la curva se mide y se recorre por distancia, no por
 * parámetro: si no, frenaría después de la luna) y deja una estela de
 * chispas, que es lo que la delata sobre el cielo oscuro; contra la luna se
 * ve entera, en silueta.
 *
 * Todo se mueve por tiempo real (deltaTime), no por cuadro: en un teléfono
 * de 120 Hz no vuela al doble de velocidad. Mientras no vuela nada, el
 * lienzo ni se toca.
 *
 * Devuelve la baja, con tres mandos colgados: `estampida(desde, cuantos)`,
 * `bruja()` y `festejo()`. `origen` es el centro de la luna (o una función
 * que lo da, para que siga a la luna cuando se mueve con el scroll).
 */
export function vuelosDeMurcielagos(canvas, { noche = false, origen = null, bruja = false } = {}) {
  if (!canvas || reducido()) {
    const nada = () => {};
    nada.estampida = nada;
    nada.bruja = nada;
    nada.festejo = nada;
    return nada;
  }
  const { ctx, tam, soltar } = lienzoNitido(canvas);
  // Los colores se leen del CSS cada vez que algo sale a volar, no una sola
  // vez al montar: el interruptor de tema claro/oscuro está en Perfil a una
  // fila de la temporada, y la escena no se vuelve a montar al cambiarlo.
  const esClaro = () => document.documentElement.dataset.tema === 'claro';
  const colorMurcielago = () => getComputedStyle(canvas).color;
  const colorBruja = () => getComputedStyle(canvas).getPropertyValue('--nl-bruja').trim() || '#241d36';
  // En oscuro las chispas SUMAN luz; en claro sumar luz sobre blanco no se
  // ve, así que ahí se pintan normales y en tonos más hondos. Las dos paletas
  // se pintan de una vez (siete lienzos diminutos).
  const PALETAS = {
    oscuro: ['#ffd27a', '#ffb347', '#ff7a1a', '#d9b8ff'].map((c) => crearDestello(c, '#ffffff')),
    claro: ['#c2410c', '#b45309', '#7c3aed'].map((c) => crearDestello(c, c)),
  };

  const murcielagos = [];
  const bandadas = [];
  const chispas = [];
  let vuelo = null;
  let ultimaBruja = -1e9;
  let reloj = 0;
  let sucio = false;
  const centroLuna = () => (typeof origen === 'function' ? origen() : origen) || { x: tam.ancho * 0.75, y: 40 };

  const nuevaBandada = (angulo, velocidad) => {
    const b = { ang: angulo, vel: velocidad, curva: azarT(-0.0025, 0.0025), semilla: azarT(0, 500) };
    bandadas.push(b);
    return b;
  };

  const nuevo = (bandada, op) => {
    const prof = op.prof ?? Math.random();
    murcielagos.push({
      x: op.x,
      y: op.y,
      vx: op.vx,
      vy: op.vy,
      prof,
      meta: op.meta ?? prof,
      bandada,
      fase: azarT(0, Math.PI * 2),
      ritmo: azarT(0.24, 0.32),
      planea: 0,
      col: colorMurcielago(),
    });
  };

  // Un grupo que entra por un lado de la pantalla, en fila desordenada.
  const grupo = () => {
    const lado = Math.random() < 0.5 ? -1 : 1;
    const ang = (lado < 0 ? 0 : Math.PI) + azarT(-0.22, 0.22);
    const band = nuevaBandada(ang, azarT(1.5, 2.4));
    const y = tam.alto * azarT(0.06, 0.38);
    const n = noche ? gsap.utils.random(3, 6, 1) : gsap.utils.random(2, 4, 1);
    for (let i = 0; i < n; i += 1) {
      const atras = i * azarT(18, 40);
      nuevo(band, {
        x: lado < 0 ? -40 - atras : tam.ancho + 40 + atras,
        y: y + azarT(-26, 26),
        vx: Math.cos(ang) * band.vel,
        vy: Math.sin(ang) * band.vel,
      });
    }
  };

  // La bandada que sale de la luna: se abre en abanico y se reparte en tres
  // grupos según hacia dónde salió cada uno.
  const estampida = (desde = centroLuna(), cuantos = 16) => {
    if (document.hidden) return;
    const izq = nuevaBandada(Math.PI - azarT(0.08, 0.3), azarT(1.8, 2.6));
    const der = nuevaBandada(azarT(0.08, 0.3), azarT(1.8, 2.6));
    const abajo = nuevaBandada(Math.PI / 2 + azarT(-0.5, 0.5), azarT(1.5, 2.1));
    for (let i = 0; i < cuantos; i += 1) {
      const ang = azarT(-Math.PI, Math.PI);
      const vel = azarT(1.4, 3.2);
      const cos = Math.cos(ang);
      nuevo(cos < -0.35 ? izq : cos > 0.35 ? der : abajo, {
        x: desde.x + azarT(-8, 8),
        y: desde.y + azarT(-8, 8),
        vx: cos * vel,
        vy: Math.sin(ang) * vel * 0.6,
        prof: 0.04,
        meta: azarT(0.35, 1),
      });
    }
  };

  /* ── la bruja ── */
  const punto = (v, t) => {
    const u = 1 - t;
    return {
      x: u * u * v.p0.x + 2 * u * t * v.c.x + t * t * v.p2.x,
      y: u * u * v.p0.y + 2 * u * t * v.c.y + t * t * v.p2.y,
    };
  };
  const tangente = (v, t) => ({
    x: 2 * (1 - t) * (v.c.x - v.p0.x) + 2 * t * (v.p2.x - v.c.x),
    y: 2 * (1 - t) * (v.c.y - v.p0.y) + 2 * t * (v.p2.y - v.c.y),
  });

  let reintento = null;
  const lanzarBruja = () => {
    if (!bruja || vuelo) return false;
    // Solo cruza si la luna está a la vista: con la página bajada, la franja
    // de cielo ya no existe y volaría sobre las tarjetas. Si no se puede
    // ahora, se vuelve a intentar en un rato en vez de esperar la vuelta
    // entera del calendario.
    const luna = centroLuna();
    if (document.hidden || luna.y < 8 || (window.scrollY || 0) > 12) {
      if (!reintento) reintento = gsap.delayedCall(20, () => { reintento = null; lanzarBruja(); });
      return false;
    }
    const dir = Math.random() < 0.65 ? 1 : -1;
    const p0 = { x: dir > 0 ? -70 : tam.ancho + 70, y: luna.y + 16 };
    const p2 = { x: dir > 0 ? tam.ancho + 70 : -70, y: luna.y - 22 };
    const v = {
      p0,
      p2,
      c: { x: 2 * luna.x - 0.5 * (p0.x + p2.x), y: 2 * luna.y - 0.5 * (p0.y + p2.y) },
      dir,
      u: 0,
      dur: azarT(380, 440),
      esc: tam.ancho > 600 ? 0.6 : 0.5,
      cuadro: 0,
      tabla: [],
      col: colorBruja(),
    };
    // Se mide la curva para recorrerla por distancia.
    let largo = 0;
    let previo = v.p0;
    for (let i = 1; i <= 64; i += 1) {
      const p = punto(v, i / 64);
      largo += Math.hypot(p.x - previo.x, p.y - previo.y);
      v.tabla.push({ t: i / 64, l: largo });
      previo = p;
    }
    v.largo = largo;
    vuelo = v;
    ultimaBruja = reloj;
    return true;
  };

  const tDe = (v, u) => {
    const meta = u * v.largo;
    let antes = { t: 0, l: 0 };
    for (let i = 0; i < v.tabla.length; i += 1) {
      const m = v.tabla[i];
      if (m.l >= meta) return antes.t + ((meta - antes.l) / Math.max(m.l - antes.l, 1e-6)) * (m.t - antes.t);
      antes = m;
    }
    return 1;
  };

  /* ── el cuadro ── */
  const R_VECINO = 64 * 64;
  const R_ESPACIO = 22 * 22;

  const moverMurcielagos = (dt) => {
    bandadas.forEach((b) => { b.ang += (b.curva + Math.sin((reloj + b.semilla) * 0.018) * 0.004) * dt; });
    for (let i = murcielagos.length - 1; i >= 0; i -= 1) {
      const m = murcielagos[i];
      let n = 0;
      let ax = 0;
      let ay = 0;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < murcielagos.length; j += 1) {
        const o = murcielagos[j];
        if (o !== m && o.bandada === m.bandada) {
          const dx = m.x - o.x;
          const dy = m.y - o.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R_VECINO) {
            n += 1;
            ax += o.vx;
            ay += o.vy;
            cx += o.x;
            cy += o.y;
            if (d2 < R_ESPACIO && d2 > 0.01) { sx += dx / d2; sy += dy / d2; }
          }
        }
      }
      const b = m.bandada;
      let fx = (Math.cos(b.ang) * b.vel - m.vx) * 0.03;
      let fy = (Math.sin(b.ang) * b.vel - m.vy) * 0.03;
      if (n) {
        fx += (ax / n - m.vx) * 0.045 + (cx / n - m.x) * 0.0011;
        fy += (ay / n - m.vy) * 0.045 + (cy / n - m.y) * 0.0011;
      }
      fx += sx * 0.85 + azarT(-0.045, 0.045);
      fy += sy * 0.85 + azarT(-0.06, 0.06);
      m.vx += fx * dt;
      m.vy += fy * dt;
      const rapidez = Math.hypot(m.vx, m.vy);
      const tope = 2.2 + m.prof * 1.6;
      if (rapidez > tope) { m.vx *= tope / rapidez; m.vy *= tope / rapidez; }
      m.prof += (m.meta - m.prof) * 0.015 * dt;
      if (m.planea > 0) m.planea -= dt;
      else if (Math.random() < 0.003 * dt) m.planea = azarT(22, 46);
      if (m.planea <= 0) m.fase += m.ritmo * (1.3 - m.prof * 0.4) * (Math.cos(m.fase) < 0 ? 1.35 : 0.78) * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fuera = (m.x < -160 && m.vx < 0) || (m.x > tam.ancho + 160 && m.vx > 0)
        || (m.y < -160 && m.vy < 0) || (m.y > tam.alto + 160 && m.vy > 0);
      if (fuera) { murcielagos.splice(i, 1); continue; }
      const s = 9 + m.prof * 20;
      const aleteo = m.planea > 0 ? -0.2 : Math.sin(m.fase);
      ctx.save();
      ctx.translate(m.x, m.y + aleteo * s * 0.08);
      ctx.rotate(Math.max(-0.5, Math.min(0.5, m.vy * 0.2)) + m.vx * 0.02);
      ctx.globalAlpha = 0.55 + m.prof * 0.45;
      ctx.fillStyle = m.col;
      dibujarMurcielago(ctx, s, aleteo);
      ctx.restore();
    }
    for (let i = bandadas.length - 1; i >= 0; i -= 1) {
      if (!murcielagos.some((m) => m.bandada === bandadas[i])) bandadas.splice(i, 1);
    }
  };

  const moverBruja = (dt) => {
    const v = vuelo;
    if (!v) return;
    v.cuadro += dt;
    v.u = Math.min(1, v.u + dt / v.dur);
    const t = tDe(v, v.u);
    const p = punto(v, t);
    const d = tangente(v, t);
    const ang = Math.atan2(d.y * v.dir, d.x * v.dir) + Math.sin(v.cuadro * 0.05) * 0.035;
    const y = p.y + Math.sin(v.cuadro * 0.075) * 2.4;
    // La estela sale de las puntas de las cerdas.
    const lx = -62 * v.dir * v.esc;
    const ly = 5 * v.esc;
    const cola = { x: p.x + Math.cos(ang) * lx - Math.sin(ang) * ly, y: y + Math.sin(ang) * lx + Math.cos(ang) * ly };
    const cuantas = Math.floor(2.2 * dt + Math.random());
    const paleta = esClaro() ? PALETAS.claro : PALETAS.oscuro;
    for (let i = 0; i < cuantas; i += 1) {
      chispas.push({
        x: cola.x + azarT(-3, 3),
        y: cola.y + azarT(-3, 3),
        vx: -v.dir * azarT(0.1, 0.5) + azarT(-0.3, 0.3),
        vy: azarT(-0.3, 0.45),
        vida: 1,
        dec: azarT(0.011, 0.026),
        r: azarT(0.7, 1.8),
        destello: paleta[Math.floor(Math.random() * paleta.length)],
        titila: Math.random() < 0.4,
      });
    }
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(ang);
    ctx.scale(v.dir * v.esc, v.esc);
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.col;
    dibujarBruja(ctx, v.cuadro);
    ctx.restore();
    if (v.u >= 1) vuelo = null;
  };

  const moverChispas = (dt) => {
    if (!chispas.length) return;
    const claro = esClaro();
    const escala = claro ? 4.5 : 7;
    ctx.globalCompositeOperation = claro ? 'source-over' : 'lighter';
    for (let i = chispas.length - 1; i >= 0; i -= 1) {
      const c = chispas[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 0.006 * dt;
      c.vida -= c.dec * dt;
      if (c.vida <= 0) { chispas.splice(i, 1); continue; }
      ctx.globalAlpha = c.vida * (c.titila && Math.random() < 0.3 ? 0.35 : 1);
      const lado = c.r * escala;
      ctx.drawImage(c.destello, c.x - lado / 2, c.y - lado / 2, lado, lado);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const tick = (tiempo, delta) => {
    if (document.hidden) return;
    const dt = Math.min(delta / 16.667, 3);
    reloj += dt;
    if (!murcielagos.length && !vuelo && !chispas.length) {
      if (sucio) { ctx.clearRect(0, 0, tam.ancho, tam.alto); sucio = false; }
      return;
    }
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
    sucio = true;
    moverMurcielagos(dt);
    moverBruja(dt);
    moverChispas(dt);
  };
  gsap.ticker.add(tick);

  // El calendario: grupos de murciélagos cada tanto y, de vez en cuando, la
  // bruja. Una línea de tiempo que se repite (y se pausa en segundo plano),
  // no temporizadores que se encadenan.
  const programa = [];
  programa.push(gsap.timeline({ repeat: -1, repeatRefresh: true, delay: 2.5 })
    .call(() => { if (!document.hidden) grupo(); })
    .to({}, { duration: () => (noche ? azarT(3.5, 7) : azarT(7, 14)) }));
  if (noche) programa.push(gsap.delayedCall(0.6, () => estampida()));
  if (bruja) {
    programa.push(gsap.timeline({ repeat: -1, repeatRefresh: true, delay: 4.5 })
      .call(lanzarBruja)
      .to({}, { duration: () => (noche ? azarT(45, 90) : azarT(150, 260)) }));
  }
  const pararPrograma = ahorrarEnSegundoPlano(...programa);

  const parar = () => {
    gsap.ticker.remove(tick);
    pararPrograma();
    if (reintento) reintento.kill();
    soltar();
    murcielagos.length = 0;
    chispas.length = 0;
    vuelo = null;
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
  };
  parar.estampida = estampida;
  parar.bruja = lanzarBruja;
  // Se cerró la celebración de un registro: la bandada sale de la luna y, si
  // hace rato que no pasa, la bruja también.
  parar.festejo = () => {
    estampida(centroLuna(), 18);
    if (reloj - ultimaBruja > 600) gsap.delayedCall(0.9, lanzarBruja);
  };
  return parar;
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
  const nubes = raiz.querySelectorAll('[data-nube]');
  if (nubes.length) tl.from(nubes, { opacity: 0, duration: 2.2, ease: 'power1.out' }, 0.6);
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
  if (tela) anims.push(gsap.to(tela, { rotation: 1, svgOrigin: '0 0', duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  return ahorrarEnSegundoPlano(...anims);
}

/**
 * El cielo vivo de la franja de arriba. Cuatro cosas pequeñas que juntas
 * hacen que la noche no se vea pintada:
 *
 *   · ESTRELLAS que titilan, cada una a su ritmo.
 *   · NUBES que cruzan por delante de la luna. Sobre el cielo oscuro casi
 *     no se ven; contra la luna sí, como de noche. Y mientras la tapan, la
 *     luz de la luna baja: la posición se lee de GSAP (no del DOM) para no
 *     medir el layout en cada cuadro.
 *   · UNA ESTRELLA FUGAZ cada tanto.
 *   · ROCÍO en la telaraña: un destello que recorre un hilo de la espiral,
 *     como cuando le da la luz.
 */
export function cieloVivo(raiz) {
  if (!raiz || reducido()) return undefined;
  const anims = [];

  raiz.querySelectorAll('[data-estrella]').forEach((estrella) => {
    anims.push(gsap.to(estrella, {
      opacity: () => azarT(0.12, 0.95),
      duration: () => azarT(0.9, 2.8),
      ease: 'sine.inOut',
      repeat: -1,
      repeatRefresh: true,
      delay: azarT(0, 1.5),
    }));
  });

  const luz = raiz.querySelector('.nl-luz');
  if (luz) anims.push(gsap.to(luz, { scale: 1.07, duration: 5.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }));

  // Nubes: cada una cruza a su velocidad y arranca a media vuelta, para que
  // al abrir la app no salgan todas desde el borde.
  const luna = raiz.querySelector('.nl-luna');
  const nubes = Array.from(raiz.querySelectorAll('[data-nube]'));
  const medidas = nubes.map((n) => ({
    izq: n.offsetLeft, ancho: n.offsetWidth, cy: n.offsetTop + n.offsetHeight / 2, alto: n.offsetHeight,
  }));
  nubes.forEach((nube, i) => {
    const escena = nube.parentElement?.offsetWidth || window.innerWidth;
    // El viaje se mide desde su `left`: así cada nube puede tener su sitio
    // de reposo (el que se ve con menos movimiento) sin aparecer a media
    // pantalla al empezar cada vuelta.
    const m = medidas[i];
    const viaje = gsap.fromTo(nube, { x: -m.izq - m.ancho - 30 }, {
      x: escena - m.izq + 30, duration: azarT(60, 95) * (i ? 1.4 : 1), ease: 'none', repeat: -1,
    });
    viaje.progress(Math.random());
    anims.push(viaje);
  });
  let medirNubes = null;
  if (luz && luna && nubes.length) {
    const lx = luna.offsetLeft + luna.offsetWidth / 2;
    const ly = luna.offsetTop + luna.offsetHeight / 2;
    const lr = luna.offsetWidth / 2;
    const ponerLuz = gsap.quickSetter(luz, 'opacity');
    let antes = -1;
    medirNubes = () => {
      if (document.hidden) return;
      let tapado = 0;
      nubes.forEach((nube, i) => {
        const m = medidas[i];
        const cx = m.izq + Number(gsap.getProperty(nube, 'x')) + m.ancho / 2;
        const dx = Math.abs(cx - lx) / (m.ancho * 0.45 + lr);
        const dy = Math.abs(m.cy - ly) / (m.alto * 0.5 + lr);
        tapado = Math.max(tapado, Math.max(0, 1 - dx) * Math.max(0, 1 - dy * 0.7));
      });
      const valor = Math.round((1 - tapado * 0.7) * 100) / 100;
      if (valor !== antes) { ponerLuz(valor); antes = valor; }
    };
    gsap.ticker.add(medirNubes);
  }

  const fugaz = raiz.querySelector('.nl-fugaz');
  if (fugaz) {
    const cruzar = () => {
      if (document.hidden) return;
      const ancho = fugaz.parentElement?.offsetWidth || window.innerWidth;
      const izq = Math.random() < 0.5;
      const grados = izq ? azarT(10, 24) : 180 - azarT(10, 24);
      const rad = (grados * Math.PI) / 180;
      const x0 = (izq ? azarT(0.05, 0.4) : azarT(0.6, 0.95)) * ancho;
      const y0 = azarT(6, 24);
      const largo = azarT(80, 130);
      gsap.timeline()
        .set(fugaz, { x: x0, y: y0, rotation: grados, scaleX: 0.1, opacity: 0 })
        .to(fugaz, { opacity: 1, scaleX: 1, duration: 0.18, ease: 'power2.out' })
        .to(fugaz, {
          x: x0 + Math.cos(rad) * largo, y: y0 + Math.sin(rad) * largo, duration: 0.75, ease: 'power1.in',
        }, 0)
        .to(fugaz, { opacity: 0, scaleX: 0.3, duration: 0.32, ease: 'power2.in' }, 0.5);
    };
    anims.push(gsap.timeline({ repeat: -1, repeatRefresh: true, delay: azarT(6, 12) })
      .call(cruzar)
      .to({}, { duration: () => azarT(22, 48) }));
  }

  const rocio = Array.from(raiz.querySelectorAll('[data-rocio]'));
  if (rocio.length) {
    const brillar = () => {
      if (document.hidden) return;
      const hilo = rocio[Math.floor(Math.random() * rocio.length)];
      gsap.fromTo(hilo, { strokeDashoffset: 0.08 }, { strokeDashoffset: -1.06, duration: azarT(1.4, 2.2), ease: 'sine.inOut' });
    };
    anims.push(gsap.timeline({ repeat: -1, repeatRefresh: true, delay: 3.5 })
      .call(brillar)
      .to({}, { duration: () => azarT(5, 10) }));
  }

  const parar = ahorrarEnSegundoPlano(...anims);
  return () => {
    if (medirNubes) gsap.ticker.remove(medirNubes);
    parar();
  };
}

/**
 * Profundidad: el cielo no está pegado al vidrio.
 *
 *   · Al hacer scroll, la luna y las estrellas se van más despacio que el
 *     contenido, y la niebla alta un poco más rápido que ellas: tres
 *     distancias, la misma regla que el ojo usa para medir lo lejos.
 *   · Al cambiar de pestaña (evento 'rgf-paso', lo manda App con la
 *     dirección), el cielo se corre al lado contrario —lo lejano poco, lo
 *     cercano más— y vuelve con un resorte, como una cámara que se paneó.
 *
 * Todo va en los envoltorios `[data-plano]`, nunca en la luna ni en las
 * nubes: esas ya tienen sus propias animaciones sobre `y` y `x`.
 */
export function profundidadNocturna(raiz) {
  if (!raiz || reducido()) return undefined;
  const PLANOS = [
    { el: raiz.querySelector('[data-plano="lejos"]'), scroll: 0.2, pan: 7 },
    { el: raiz.querySelector('[data-plano="medio"]'), scroll: 0.34, pan: 16 },
    { el: raiz.querySelector('[data-plano="cerca"]'), scroll: 0, pan: 26 },
  ].filter((p) => p.el);
  PLANOS.forEach((p) => {
    if (p.scroll) p.mover = gsap.quickTo(p.el, 'y', { duration: 0.7, ease: 'power3.out' });
  });
  const alScroll = () => {
    const s = Math.min(window.scrollY || 0, 520);
    PLANOS.forEach((p) => { if (p.mover) p.mover(-s * p.scroll); });
  };
  const alPaso = (e) => {
    const d = e.detail?.direccion;
    if (!d || document.hidden) return;
    PLANOS.forEach((p) => {
      gsap.killTweensOf(p.el, 'x');
      gsap.timeline()
        .to(p.el, { x: -d * p.pan, duration: 0.38, ease: 'power2.out' })
        .to(p.el, { x: 0, duration: 1.6, ease: 'elastic.out(1, 0.55)' });
    });
  };
  window.addEventListener('scroll', alScroll, { passive: true });
  window.addEventListener('rgf-paso', alPaso);
  alScroll();
  return () => {
    window.removeEventListener('scroll', alScroll);
    window.removeEventListener('rgf-paso', alPaso);
    PLANOS.forEach((p) => gsap.killTweensOf(p.el));
  };
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
 * Vive en el canal del borde izquierdo, fuera de las tarjetas y a la
 * izquierda del avatar de la cabecera. Devuelve la baja con un mando
 * colgado, `asustar()`: si alguien toca cerca, sube corriendo con las patas
 * a todo lo que dan, y luego vuelve a empezar.
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

  const parar = ahorrarEnSegundoPlano(tl);
  let huida = null;
  const baja = () => { if (huida) huida.kill(); parar(); };
  baja.asustar = () => {
    if (huida || hilo.caida < 24) return;
    tl.pause();
    huida = gsap.timeline({
      onUpdate: pintar,
      onComplete: () => { huida = null; tl.restart(true); },
    })
      .to(hilo, { caida: 0, duration: 0.6, ease: 'power3.in' })
      .to(arana, { rotation: 0, duration: 0.3, ease: 'power2.out' }, 0)
      .to(patas, {
        rotation: (i) => (i % 2 ? -16 : 16), svgOrigin: '12 12', duration: 0.07, ease: 'none', yoyo: true, repeat: 7,
      }, 0);
  };
  return baja;
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
      s: 8 + prof * 10,
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
  // La mitad ya viene cayendo y la otra mitad entra por arriba, escalonada:
  // la escena se ve viva desde el primer segundo sin que todos los pétalos
  // lleguen juntos. Aparecen con un fundido, no de golpe.
  for (let i = 0; i < cuantos; i += 1) {
    petalos.push(nuevo(i % 2 ? azarT(tam.alto * 0.05, tam.alto * 0.7) : azarT(-tam.alto * 0.6, -12)));
  }
  let entrada = 0;

  const alViento = () => { viento = Math.min(viento + 1.5, 2.6); };
  window.addEventListener('rgf-rafaga', alViento);

  const tick = () => {
    if (document.hidden) return;
    ctx.clearRect(0, 0, tam.ancho, tam.alto);
    viento *= 0.984;
    entrada = Math.min(entrada + 0.014, 1);
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
      ctx.globalAlpha = (0.6 + p.prof * 0.38) * entrada;
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
