/**
 * Noche de brujas: la escena de la variante Halloween de la temporada.
 *
 * Tres planos, como un escenario de teatro:
 *
 *   · FONDO (detrás de las tarjetas) — la luna asomándose sobre la cabecera,
 *     una banda de niebla que le pasa por enfrente y la telaraña en la
 *     esquina. Las tarjetas la tapan al hacer scroll y se asoma entre ellas.
 *   · NIEBLA BAJA — corre por el pie de la pantalla, detrás de la barra de
 *     pestañas.
 *   · FRENTE — la araña, que baja por el canal del borde derecho, y los
 *     murciélagos, que cruzan por encima de todo de vez en cuando.
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
  amanecerNocheDeLuna, nieblaNocturna, bajarArana, vuelosDeMurcielagos, retirarTemporada,
} from '../lib/anim';

/*
 * La telaraña de esquina: radios que salen de la esquina superior derecha
 * (160,0) hacia abajo y a la izquierda, y vueltas de espiral entre ellos.
 * Cada tramo de espiral se comba hacia la esquina, como el hilo de verdad
 * cuando lo jala el radio.
 */
const ESQUINA = { x: 160, y: 0 };
const ANGULOS = [93, 108, 123, 138, 153, 168];
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
    const bajas = [
      amanecerNocheDeLuna(raiz),
      nieblaNocturna(raiz),
      bajarArana(aranaRef.current),
      vuelosDeMurcielagos(lienzoRef.current, { noche }),
    ];
    return () => bajas.forEach((baja) => baja && baja());
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
          <div className="nl-luz" />
          <div className="nl-luna" />
          <div className="nl-niebla nl-niebla-alta" data-niebla="80" />
          <svg className="nl-telarana" viewBox="0 0 160 160" focusable="false">
            <g data-tela>
              {RADIOS.map((d) => <path key={d} data-radio d={d} />)}
              {ESPIRAL.map((d) => <path key={d} data-espiral d={d} />)}
            </g>
          </svg>
        </div>
        <div className="nl-niebla nl-niebla-baja nl-niebla-lejos" data-niebla="96" />
        <div className="nl-niebla nl-niebla-baja" data-niebla="62" />
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
