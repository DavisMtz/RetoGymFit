/**
 * Noche de brujas: la escena de la variante Halloween de la temporada.
 *
 * Tres planos, como un escenario de teatro:
 *
 *   · FONDO (detrás de las tarjetas) — una franja de cielo sobre la cabecera
 *     (el mismo hueco que abre el papel picado): estrellas que titilan, la
 *     luna llena, nubes que la tapan al pasar, una estrella fugaz de vez en
 *     cuando, una banda de niebla y la telaraña en la esquina, con rocío.
 *     El cielo va en tres planos de profundidad (`data-plano`) que se mueven
 *     a distinta velocidad con el scroll y al cambiar de pestaña.
 *   · NIEBLA BAJA — corre por el pie de la pantalla, detrás de la barra de
 *     pestañas.
 *   · FRENTE — la araña, que baja por el canal del borde izquierdo; los
 *     murciélagos, que cruzan en parvada; y la bruja, que de vez en cuando
 *     atraviesa la luna dejando una estela de chispas.
 *
 * Y responde: al cerrar la celebración de un registro sale una bandada de
 * la luna (evento 'rgf-festejo', lo manda Hoy); tocar la luna suelta unos
 * cuantos murciélagos; tocar junto a la araña la hace subir corriendo.
 *
 * El contenedor no lleva posición ni opacidad propias A PROPÓSITO: cada plano
 * es `fixed` con su z-index, y un contenedor con opacidad crearía un contexto
 * de apilamiento que mandaría los murciélagos detrás de las tarjetas. Por eso
 * al salir se apaga cada plano (`data-capa`), no el contenedor.
 *
 * El movimiento lo hace GSAP (src/lib/anim.js).
 */
import { useEffect, useRef } from 'react';
import {
  amanecerNocheDeLuna, nieblaNocturna, cieloVivo, profundidadNocturna, bajarArana, vuelosDeMurcielagos,
  retirarTemporada,
} from '../lib/anim';

/*
 * La telaraña de esquina: radios que salen de la esquina superior izquierda
 * (0,0) hacia abajo y a la derecha, y vueltas de espiral entre ellos. Cada
 * tramo de espiral se comba hacia la esquina, como el hilo de verdad cuando
 * lo jala el radio.
 */
const ESQUINA = { x: 0, y: 0 };
const ANGULOS = [12, 27, 42, 57, 72, 87];
const punto = (ang, r) => {
  const a = (ang * Math.PI) / 180;
  return { x: ESQUINA.x + Math.cos(a) * r, y: ESQUINA.y + Math.sin(a) * r };
};
const RADIOS = ANGULOS.map((ang) => {
  const p = punto(ang, 168);
  return `M${ESQUINA.x},${ESQUINA.y} L${p.x.toFixed(1)},${p.y.toFixed(1)}`;
});
const ESPIRAL = [20, 36, 54, 74, 96, 120].map((r, k) => {
  // Cada vuelta un pelo irregular: la araña no mide.
  const radio = (i) => r * (1 + ((i * 7 + k * 3) % 5 - 2) * 0.018);
  let d = '';
  ANGULOS.forEach((ang, i) => {
    const p = punto(ang, radio(i));
    if (i === 0) { d += `M${p.x.toFixed(1)},${p.y.toFixed(1)} `; return; }
    const c = punto((ang + ANGULOS[i - 1]) / 2, ((radio(i) + radio(i - 1)) / 2) * 0.9);
    d += `Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)} `;
  });
  return d.trim();
});

/**
 * Las estrellas de la franja de cielo: dieciséis, en posiciones fijas (un
 * pseudoazar con semilla, para que no cambien entre una apertura y otra) y
 * fuera del disco de la luna.
 */
const ESTRELLAS = Array.from({ length: 16 }, (_, i) => {
  const azar = (n) => {
    const x = Math.sin(i * 97.13 + n * 13.7) * 43758.5453;
    return x - Math.floor(x);
  };
  let x = 2 + azar(1) * 94;
  if (x > 62 && x < 88) x = (x + 30) % 96;
  return { x, y: 4 + azar(2) * 58, lado: azar(3) < 0.2 ? 2 : azar(3) < 0.55 ? 1.5 : 1 };
});

/** Ocho patas: cuatro por lado, dobladas en la rodilla. */
const PATAS = [
  'M10.4 9.4 L6.4 5.6 L3.6 7.4', 'M10 11 L5.2 9.8 L2.4 12.2',
  'M10 13 L5.4 14.4 L3.2 17.6', 'M10.6 14.6 L7.2 18.2 L6.2 21.6',
  'M13.6 9.4 L17.6 5.6 L20.4 7.4', 'M14 11 L18.8 9.8 L21.6 12.2',
  'M14 13 L18.6 14.4 L20.8 17.6', 'M13.4 14.6 L16.8 18.2 L17.8 21.6',
];

export default function NocheDeLuna({ saliendo = false, noche = false }) {
  const raizRef = useRef(null);
  const aranaRef = useRef(null);
  const lienzoRef = useRef(null);

  // La escena vive mientras el componente esté montado. Al salir se apaga
  // (efecto de abajo) y App la desmonta pase lo que pase con la animación.
  useEffect(() => {
    const raiz = raizRef.current;
    const luna = raiz.querySelector('.nl-luna');
    // El centro de la luna se pide cada vez: con el scroll se mueve.
    const centroLuna = () => {
      const r = luna.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const vuelos = vuelosDeMurcielagos(lienzoRef.current, { noche, origen: centroLuna, bruja: true });
    const arana = bajarArana(aranaRef.current);
    const bajas = [
      amanecerNocheDeLuna(raiz),
      nieblaNocturna(raiz),
      cieloVivo(raiz),
      profundidadNocturna(raiz),
      arana,
      vuelos,
    ];

    const alFestejo = () => vuelos.festejo();
    window.addEventListener('rgf-festejo', alFestejo);

    // Los toques no se roban: el listener es pasivo y solo mira dónde cayó
    // el dedo. Sobre un botón o un enlace no hace nada.
    let ultimoToque = 0;
    const cerca = (e, r, margen) => e.clientX > r.left - margen && e.clientX < r.right + margen
      && e.clientY > r.top - margen && e.clientY < r.bottom + margen;
    const alTocar = (e) => {
      if (e.target.closest?.('button, a, input, textarea, select, label, [role="button"]')) return;
      if (cerca(e, luna.getBoundingClientRect(), 14)) {
        if (performance.now() - ultimoToque > 900) {
          ultimoToque = performance.now();
          vuelos.estampida(centroLuna(), 7);
        }
        return;
      }
      const cuerpo = aranaRef.current?.querySelector('.nl-arana-cuerpo');
      if (cuerpo && arana?.asustar && cerca(e, cuerpo.getBoundingClientRect(), 26)) arana.asustar();
    };
    window.addEventListener('pointerdown', alTocar, { passive: true });

    return () => {
      window.removeEventListener('rgf-festejo', alFestejo);
      window.removeEventListener('pointerdown', alTocar);
      bajas.forEach((baja) => baja && baja());
    };
  }, [noche]);

  // Se apaga al salir; si vuelven a elegirla antes de que se desmonte, regresa.
  const salio = useRef(false);
  useEffect(() => {
    if (saliendo) salio.current = true;
    if (saliendo || salio.current) retirarTemporada(raizRef.current, saliendo);
  }, [saliendo]);

  return (
    <div className="noche-luna" ref={raizRef} aria-hidden="true">
      <div className="nl-cielo" data-capa>
        <div className="nl-escenario">
          <div className="nl-plano" data-plano="lejos">
            {ESTRELLAS.map((e) => (
              <span
                key={`${e.x}-${e.y}`}
                className="nl-estrella"
                data-estrella
                style={{ left: `${e.x.toFixed(1)}%`, top: `calc(env(safe-area-inset-top, 0px) + ${e.y.toFixed(1)}px)`, '--lado': `${e.lado}px` }}
              />
            ))}
            <span className="nl-fugaz" />
            <div className="nl-luz" />
            <div className="nl-luna" />
          </div>
          <div className="nl-plano" data-plano="medio">
            <div className="nl-nube nl-nube-1" data-nube />
            <div className="nl-nube nl-nube-2" data-nube />
            <div className="nl-niebla nl-niebla-alta" data-niebla="80" />
          </div>
          <svg className="nl-telarana" viewBox="0 0 160 160" focusable="false">
            <g data-tela>
              {RADIOS.map((d) => <path key={d} data-radio d={d} />)}
              {ESPIRAL.map((d) => <path key={d} data-espiral d={d} />)}
              {ESPIRAL.map((d) => <path key={`r${d}`} data-rocio d={d} pathLength="1" />)}
            </g>
          </svg>
        </div>
        <div className="nl-plano" data-plano="cerca">
          <div className="nl-niebla nl-niebla-baja nl-niebla-lejos" data-niebla="96" />
          <div className="nl-niebla nl-niebla-baja" data-niebla="62" />
        </div>
      </div>

      <div className="nl-frente" data-capa>
        <div className="nl-escenario">
          <div className="nl-arana" ref={aranaRef}>
            <span className="nl-hilo" />
            <svg className="nl-arana-cuerpo" viewBox="0 0 24 24" focusable="false">
              {PATAS.map((d) => <path key={d} data-pata d={d} />)}
              <ellipse className="nl-abdomen" cx="12" cy="15" rx="3.9" ry="4.8" />
              <circle className="nl-cabeza" cx="12" cy="9.2" r="2.5" />
              <circle className="nl-ojo" cx="11.1" cy="8.6" r="0.55" />
              <circle className="nl-ojo" cx="12.9" cy="8.6" r="0.55" />
            </svg>
          </div>
        </div>
      </div>

      <canvas className="nl-murcielagos" ref={lienzoRef} data-capa />
    </div>
  );
}
