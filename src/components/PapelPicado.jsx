/**
 * Guirnalda de papel picado.
 *
 * Cada banderín es un SVG de una sola ruta con `fill-rule: evenodd`: el
 * contorno y los recortes van en el mismo path, que es justo como se hace el
 * papel picado de verdad —una hoja doblada y perforada, no piezas pegadas—.
 * En San Salvador Huixcolotla, donde nació el oficio, el diseño se traza
 * sobre varias hojas superpuestas y se pican todas a la vez con cincel sobre
 * un molde de plomo; los motivos son florales, geométricos y solares, que son
 * justo los que están aquí.
 *
 * LA CUERDA NO VA RECTA. Una guirnalda colgada de dos puntos hace comba, y
 * ese detalle es lo que separa una guirnalda de una fila de rectángulos. La
 * comba es una parábola —`4u(1-u)`: cero en los extremos, máxima en medio— y
 * cada banderín se cuelga a la profundidad que le toca (`--pp-caida`) con la
 * inclinación que la cuerda tiene en ese punto (`--pp-giro`), así que la fila
 * se abre en abanico como las de verdad.
 *
 * La misma parábola dibuja la cuerda: el viewBox del hilo mide 1 de alto y su
 * curva toca exactamente esa base, así que la ALTURA del elemento es la comba
 * y banderines e hilo coinciden sin medir un solo píxel en JavaScript.
 *
 * El vaivén y la entrada los hace GSAP (src/lib/anim.js).
 *
 * La misma guirnalda sirve a dos fiestas: el mes patrio (las figuras y
 * colores de siempre, que son los valores por defecto) y el Día de Muertos
 * (`FIGURAS_MUERTOS` + los colores de ofrenda de config/temporada.js).
 */
import { useEffect, useRef, useState } from 'react';
import { COLORES_PAPEL } from '../config/patrio';
import { mecerPapelPicado, colgarPapelPicado, descolgarPapelPicado } from '../lib/anim';

const A = 60;   // ancho del banderín en el viewBox
const AL = 104; // alto — el papel picado real es claramente más alto que ancho

/**
 * Pendiente de la cuerda en los extremos, en grados por unidad de parábola.
 * Calibrada para el ancho de un teléfono (que es donde se usa la app): con
 * una comba de ~12 px sobre ~400 px de cuerda, el primer banderín queda a
 * ~6.6°. En pantallas anchas la comba se topa y el abanico se abre un pelo
 * más de la cuenta, una diferencia de grados que nadie va a medir.
 */
const INCLINACION = 1.85;

/** En pantallas angostas caben menos banderines sin que se vean apretados. */
const ANGOSTO = '(max-width: 420px)';

/** Borde inferior en picos, como el papel picado clásico. */
function bordeZigzag(picos = 5, base = AL - 26, punta = AL) {
  const paso = A / picos;
  let d = `L${A},${base} `;
  for (let i = picos - 1; i >= 0; i -= 1) {
    d += `L${(i + 0.5) * paso},${punta} L${i * paso},${base} `;
  }
  return d;
}

/** Borde inferior ondulado, la otra terminación tradicional. */
function bordeOndas(ondas = 3, base = AL - 22, hondo = AL) {
  const paso = A / ondas;
  let d = `L${A},${base} `;
  for (let i = ondas - 1; i >= 0; i -= 1) {
    d += `Q${(i + 0.5) * paso},${hondo} ${i * paso},${base} `;
  }
  return d;
}

/** Rombo centrado: el motivo más repetido del papel picado. */
const rombo = (cx, cy, r) => `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z `;

/** Círculo como dos arcos (dentro del mismo path, para el evenodd). */
const circulo = (cx, cy, r) =>
  `M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 `;

/**
 * Las cuatro variantes. Cada una devuelve el path completo: contorno con su
 * borde inferior + los recortes que lo perforan.
 */
const VARIANTES = [
  // Rombo grande con cuatro puntos alrededor
  () => `M0,0 H${A} ${bordeZigzag(5)} Z `
    + rombo(A / 2, 38, 15)
    + circulo(A / 2, 14, 3.4)
    + circulo(12, 38, 3) + circulo(A - 12, 38, 3)
    + circulo(A / 2, 62, 3.4),
  // Flor de seis pétalos
  () => {
    let d = `M0,0 H${A} ${bordeOndas(3)} Z ` + circulo(A / 2, 40, 6.5);
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      d += circulo(A / 2 + Math.cos(a) * 15, 40 + Math.sin(a) * 15, 5.2);
    }
    return d + circulo(A / 2, 14, 3);
  },
  // Un solo arco central (ventana de portal) con puntos a los lados.
  // Antes eran DOS arcos y el banderín leía como una cara con ojos.
  () => `M0,0 H${A} ${bordeZigzag(4)} Z `
    + `M21,62 L21,36 Q21,24 30,24 Q39,24 39,36 L39,62 Z `
    + circulo(11, 40, 3.4) + circulo(A - 11, 40, 3.4)
    + circulo(11, 55, 2.6) + circulo(A - 11, 55, 2.6)
    + circulo(A / 2, 14, 3),
  // Cuadros en rotación, como un sarape reducido a su geometría
  () => {
    let d = `M0,0 H${A} ${bordeOndas(4)} Z `;
    for (let f = 0; f < 3; f += 1) {
      for (let c = 0; c < 3; c += 1) {
        const r = f === 1 && c === 1 ? 10 : 5.4;
        d += rombo(16 + c * 14, 28 + f * 19, r);
      }
    }
    return d;
  },
];

/**
 * Figuras de ofrenda para el Día de Muertos. En el papel picado de verdad lo
 * que queda de papel tiene que seguir unido a la hoja —si no, se cae al
 * picarla—, así que la calavera cuelga de puentes finos dentro de su ventana
 * y las alas de la mariposa salen del cuerpo. Con `evenodd` cada subtrazado
 * anidado alterna: ventana (hueco) → calavera (papel) → ojos (hueco).
 */
export const FIGURAS_MUERTOS = [
  // Calavera dentro de su ventana, colgada de cuatro puentes
  () => `M0,0 H${A} ${bordeZigzag(5)} Z `
    + 'M10,8 H50 Q52,8 52,10 V68 Q52,70 50,70 H10 Q8,70 8,68 V10 Q8,8 10,8 Z '
    + 'M15,34 A15,15 0 0 1 45,34 C45,41 42.4,44 39,46 V53 Q39,57 35,57 H25 Q21,57 21,53 V46 C17.6,44 15,41 15,34 Z '
    + 'M29.2,8 H30.8 V19.1 H29.2 Z M29.2,56.9 H30.8 V70 H29.2 Z '
    + 'M8,33.2 H15.2 V34.8 H8 Z M44.8,33.2 H52 V34.8 H44.8 Z '
    + circulo(24, 35, 4.6) + circulo(36, 35, 4.6)
    + 'M30,40.6 L27.4,45.2 H32.6 Z '
    + 'M25.6,49 H27 V55 H25.6 Z M29.3,49 H30.7 V55 H29.3 Z M33,49 H34.4 V55 H33 Z '
    + circulo(A / 2, 74.5, 2),
  // Cempasúchil: la flor de pétalos apretados, en dos coronas
  () => {
    let d = `M0,0 H${A} ${bordeOndas(3)} Z ` + circulo(A / 2, 40, 4.2);
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI / 4) * i;
      d += circulo(A / 2 + Math.cos(a) * 10, 40 + Math.sin(a) * 10, 3.5);
    }
    for (let i = 0; i < 12; i += 1) {
      const a = (Math.PI / 6) * i + Math.PI / 12;
      d += circulo(A / 2 + Math.cos(a) * 18.5, 40 + Math.sin(a) * 18.5, 3);
    }
    return d + circulo(A / 2, 12, 2.6);
  },
  // Vela de la ofrenda con su flama y sus destellos
  () => `M0,0 H${A} ${bordeZigzag(4)} Z `
    + 'M30,14 C34,20 35.5,24 35.5,27 C35.5,30.6 33,33 30,33 C27,33 24.5,30.6 24.5,27 C24.5,24 26,20 30,14 Z '
    + 'M24,38 H36 V64 H24 Z '
    + 'M17,66 H43 V70.5 H17 Z '
    + rombo(13, 26, 4) + rombo(A - 13, 26, 4)
    + circulo(14, 46, 2.4) + circulo(A - 14, 46, 2.4)
    + circulo(14, 58, 2) + circulo(A - 14, 58, 2),
  // Mariposa monarca: llegan a Michoacán justo para muertos, y se dice que
  // son las almas que vuelven
  () => `M0,0 H${A} ${bordeOndas(4)} Z `
    + 'M28.6,38 C22,23 9,21.5 9.5,30 C10,37.5 18.5,42 28.6,40.4 Z '
    + 'M31.4,38 C38,23 51,21.5 50.5,30 C50,37.5 41.5,42 31.4,40.4 Z '
    + 'M28.6,42.4 C20,42 13.5,48.5 15.6,54.6 C17.8,60 25.4,56.6 28.6,46.6 Z '
    + 'M31.4,42.4 C40,42 46.5,48.5 44.4,54.6 C42.2,60 34.6,56.6 31.4,46.6 Z '
    + circulo(15.2, 30, 1.7) + circulo(A - 15.2, 30, 1.7)
    + circulo(20, 51.5, 1.4) + circulo(A - 20, 51.5, 1.4)
    + circulo(26.4, 22, 1.5) + circulo(A - 26.4, 22, 1.5)
    + circulo(A / 2, 70, 2.6),
];

/** Cuántos banderines caben. Se mide de verdad, no se esconden con CSS: la
 *  comba depende de CUÁNTOS hay, y unos ocultos la dejarían mal calculada. */
function usarCantidad() {
  const consulta = () => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(ANGOSTO).matches
    : false);
  const [angosto, setAngosto] = useState(consulta);
  useEffect(() => {
    const mq = window.matchMedia?.(ANGOSTO);
    if (!mq) return undefined;
    const alCambiar = (e) => setAngosto(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return angosto ? 7 : 9;
}

export default function PapelPicado({ saliendo = false, colores = COLORES_PAPEL, figuras = VARIANTES }) {
  const filaRef = useRef(null);
  const cantidad = usarCantidad();

  // Se cuelga al aparecer y se mece mientras esté puesta. Al apagar el tema,
  // `saliendo` la descuelga antes de que App la desmonte.
  useEffect(() => {
    if (saliendo) return undefined;
    colgarPapelPicado(filaRef.current);
    return mecerPapelPicado(filaRef.current);
  }, [saliendo, cantidad]);

  useEffect(() => {
    if (saliendo) descolgarPapelPicado(filaRef.current);
  }, [saliendo]);

  return (
    <div className="papel-picado" aria-hidden="true">
      <svg className="pp-cuerda" viewBox="0 0 100 1" preserveAspectRatio="none" focusable="false">
        <path d="M0,0 Q50,2 100,0" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pp-fila" ref={filaRef}>
        {Array.from({ length: cantidad }, (_, i) => {
          const u = (i + 0.5) / cantidad;          // dónde cae en la cuerda
          const caida = 4 * u * (1 - u);           // fracción de la comba
          const giro = (4 - 8 * u) * INCLINACION;  // pendiente de la cuerda ahí
          return (
            <span
              key={i}
              className="pp-nudo"
              style={{ '--pp-caida': caida.toFixed(3), '--pp-giro': `${giro.toFixed(2)}deg` }}
            >
              <svg
                className="pp-banderin"
                viewBox={`0 0 ${A} ${AL}`}
                preserveAspectRatio="none"
                focusable="false"
              >
                <path
                  d={figuras[i % figuras.length]()}
                  fill={colores[i % colores.length]}
                  fillRule="evenodd"
                />
              </svg>
            </span>
          );
        })}
      </div>
    </div>
  );
}
