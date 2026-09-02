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

export default function PapelPicado({ saliendo = false }) {
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
                  d={VARIANTES[i % VARIANTES.length]()}
                  fill={COLORES_PAPEL[i % COLORES_PAPEL.length]}
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
