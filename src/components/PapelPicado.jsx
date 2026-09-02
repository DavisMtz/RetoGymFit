/**
 * Guirnalda de papel picado.
 *
 * Cada banderín es un SVG de una sola ruta con `fill-rule: evenodd`: el
 * contorno y los recortes van en el mismo path, que es justo como se hace el
 * papel picado de verdad —una hoja doblada y perforada, no piezas pegadas—.
 *
 * Las variantes son deterministas por índice: la guirnalda se ve variada pero
 * idéntica en cada render, así no "salta" al re-montarse el componente.
 *
 * El vaivén lo hace GSAP (mecerPapelPicado en src/lib/anim.js), con desfase
 * por banderín para que la fila ondule como una cuerda y no como un bloque.
 */
import { useEffect, useRef } from 'react';
import { COLORES_PAPEL } from '../config/patrio';
import { mecerPapelPicado } from '../lib/anim';

const A = 60;   // ancho del banderín en el viewBox
const AL = 104; // alto — el papel picado real es claramente más alto que ancho

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

export default function PapelPicado({ cantidad = 9 }) {
  const filaRef = useRef(null);

  useEffect(() => mecerPapelPicado(filaRef.current), []);

  return (
    <div className="papel-picado" aria-hidden="true">
      <div className="pp-fila" ref={filaRef}>
        {Array.from({ length: cantidad }, (_, i) => (
          <svg
            key={i}
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
        ))}
      </div>
    </div>
  );
}
