/**
 * Modal de la temporada: aquí cada quien ELIGE cómo se viste su app.
 * Se muestra una sola vez por temporada (la marca es el año).
 *
 * Elegir no es un formulario: al tocar una opción la app se cambia en ese
 * instante —el acento del modal y la escena de atrás—, y el emblema de esa
 * opción cobra vida. La calabaza se enciende como vela, con su cerillo; el
 * cempasúchil se abre pétalo por pétalo. La que no está elegida se apaga o se
 * cierra en botón, así se ve cuál manda sin leer nada.
 *
 * Cerrar sin tocar ninguna no guarda elección: decide la fecha (brujas en
 * octubre, muertos el 1 y 2 de noviembre).
 */
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { vibrate } from './ui';
import {
  trazarEmblemasTemporada, encenderCalabaza, abrirCempasuchil, vuelosDeMurcielagos, petalosDeCempasuchil,
} from '../lib/anim';
import { hoyMX } from '../lib/dates';
import { formasCelebracion } from '../lib/celebracion';
import {
  saludoTemporada, varianteDelDia, esNocheDeBrujas, esDiaDeMuertos, CONFETI_BRUJAS, CONFETI_MUERTOS, NOMBRES,
} from '../config/temporada';
import { elegirTemporada, temporadaVisible, marcarBienvenidaVista } from '../lib/temporada';

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** La cara tallada: ojos, nariz y una sonrisa con dientes. */
const CARA = [
  'M35.5 52.5 L41.5 44.5 L46 53 Z',
  'M50 53 L54.5 44.5 L60.5 52.5 Z',
  'M45.6 58.6 L48 54.6 L50.4 58.6 Z',
  'M32.5 62.5 L36.5 65.6 L40 63.2 L44 66.8 L48 64 L52 66.8 L56 63.2 L59.5 65.6 L63.5 62.5 Q48 82 32.5 62.5 Z',
];

function Calabaza({ svgRef }) {
  return (
    <svg ref={svgRef} className="tp-emblema" viewBox="0 0 96 96" fill="none" focusable="false" aria-hidden="true">
      <defs>
        <radialGradient id="tp-vela" cx="50%" cy="58%" r="60%">
          <stop offset="0" stopColor="#fff3c9" />
          <stop offset="0.45" stopColor="#ffc46b" />
          <stop offset="1" stopColor="#ff8a1a" />
        </radialGradient>
        <radialGradient id="tp-resplandor" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tp-cascara" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a2a" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      {/* La luz que la vela echa alrededor: solo existe encendida */}
      <ellipse data-luz cx="48" cy="60" rx="46" ry="36" fill="url(#tp-resplandor)" opacity="0" />
      <g data-relleno>
        <ellipse cx="33" cy="59" rx="19" ry="23" fill="#d4500c" />
        <ellipse cx="63" cy="59" rx="19" ry="23" fill="#d4500c" />
        <ellipse cx="48" cy="58" rx="20" ry="25.5" fill="url(#tp-cascara)" />
      </g>
      <path data-trazo d="M40 35 Q33.5 58 40 81" stroke="#8f3209" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      <path data-trazo d="M56 35 Q62.5 58 56 81" stroke="#8f3209" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
      <path d="M44.6 39 Q41.8 50 43.6 60" stroke="#ffd9ad" strokeWidth="1.6" strokeLinecap="round" opacity="0.32" />
      <path data-relleno d="M46 35 C46 29 47 25 51 21 L54.5 23 C51.5 26 50.6 30 50.6 35 Z" fill="#5a7a2b" />
      <path data-trazo d="M51.5 27 C56 22.5 61.5 24 60.5 29.5" stroke="#5a7a2b" strokeWidth="1.6" strokeLinecap="round" />
      {/* La cara: hueco oscuro apagada; vela encima, que es lo que se prende */}
      <g fill="#3b1405">{CARA.map((d) => <path key={d} d={d} />)}</g>
      <g data-luz fill="url(#tp-vela)" opacity="0">{CARA.map((d) => <path key={d} d={d} />)}</g>
    </svg>
  );
}

/** Pétalo rizado, dibujado desde el centro de la flor hacia arriba. */
const PETALO = 'M0 -6 C-5.5 -10 -8 -19 -5.8 -24.5 C-4.6 -27 -2.8 -26.2 -2 -27.6 C-0.9 -29 0.9 -29 2 -27.6 '
  + 'C2.8 -26.2 4.6 -27 5.8 -24.5 C8 -19 5.5 -10 0 -6 Z';

/** Cuatro coronas, de la de afuera (más oscura) al corazón (más clara). */
const CORONAS = [
  { n: 14, escala: 1, color: '#f26b0f', giro: 0 },
  { n: 11, escala: 0.8, color: '#ff8a00', giro: 13 },
  { n: 9, escala: 0.6, color: '#ffa41c', giro: 5 },
  { n: 6, escala: 0.4, color: '#ffc23d', giro: 22 },
];

function Cempasuchil({ svgRef }) {
  return (
    <svg ref={svgRef} className="tp-emblema" viewBox="0 0 96 96" fill="none" focusable="false" aria-hidden="true">
      <path data-trazo d="M48 70 C48 78 47.2 84 46 93" stroke="#3f7a2a" strokeWidth="2.4" strokeLinecap="round" />
      <path data-relleno d="M47.4 80 C41 77 36.5 78.5 34 82 C39 84.5 44 83.6 47.4 80 Z" fill="#3f7a2a" />
      <path data-relleno d="M47 86 C53 82.5 58 83.4 61 86.4 C56 89.5 51 89 47 86 Z" fill="#3f7a2a" />
      <g data-flor>
        {CORONAS.map((c) => Array.from({ length: c.n }, (_, i) => (
          <g key={`${c.n}-${i}`} transform={`translate(48 44) rotate(${(c.giro + (360 / c.n) * i).toFixed(1)}) scale(${c.escala})`}>
            <path data-petalo d={PETALO} fill={c.color} stroke="#9a3f07" strokeOpacity="0.45" strokeWidth={(0.6 / c.escala).toFixed(2)} />
          </g>
        )))}
        <circle cx="48" cy="44" r="3.4" fill="#b8410a" />
      </g>
    </svg>
  );
}

const OPCIONES = [
  { id: 'brujas', sub: 'Luna, niebla y murciélagos' },
  { id: 'muertos', sub: 'Papel picado y cempasúchil' },
];

export default function TemporadaBienvenida({ onCerrar }) {
  const hoy = hoyMX();
  const { titulo, texto } = saludoTemporada(hoy);
  const [visible, setVisible] = useState(false);
  const [elegida, setElegida] = useState(() => temporadaVisible() || varianteDelDia(hoy));
  const toco = useRef(false);   // ¿eligió de verdad, o solo vio la que puso la fecha?
  const opcionesRef = useRef(null);
  const calabazaRef = useRef(null);
  const florRef = useRef(null);
  const fiestaRef = useRef(null);
  const noche = esNocheDeBrujas(hoy);
  const muertos = esDiaDeMuertos(hoy);
  const fiesta = (elegida === 'brujas' && noche) || (elegida === 'muertos' && muertos);

  useEffect(() => {
    // Un respiro antes de aparecer: que la app cargue primero.
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    return trazarEmblemasTemporada(opcionesRef.current);
  }, [visible]);

  // La elegida cobra vida; la otra se apaga o se cierra.
  useEffect(() => {
    if (!visible) return undefined;
    const bajaCalabaza = encenderCalabaza(calabazaRef.current, elegida === 'brujas');
    const bajaFlor = abrirCempasuchil(florRef.current, elegida === 'muertos');
    return () => { if (bajaCalabaza) bajaCalabaza(); if (bajaFlor) bajaFlor(); };
  }, [visible, elegida]);

  // Las noches grandes, por encima del modal: la bandada el 31, la lluvia de
  // flor el 1 y el 2 de noviembre. Cada una solo con su variante.
  useEffect(() => {
    if (!visible || !fiesta) return undefined;
    const lienzo = fiestaRef.current;
    if (elegida === 'brujas') {
      return vuelosDeMurcielagos(lienzo, { noche: true, origen: { x: window.innerWidth / 2, y: window.innerHeight * 0.3 } });
    }
    return petalosDeCempasuchil(lienzo, { abundancia: 2.2 });
  }, [visible, fiesta, elegida]);

  function elegir(id, evento) {
    if (id === elegida && toco.current) return;
    vibrate(12);
    toco.current = true;
    setElegida(id);
    elegirTemporada(id); // la app cambia YA, con el modal abierto
    if (!reducido()) {
      const r = evento.currentTarget.getBoundingClientRect();
      confetti({
        particleCount: 22,
        spread: 64,
        startVelocity: 20,
        gravity: 0.7,
        ticks: 160,
        origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.4) / window.innerHeight },
        colors: id === 'brujas' ? CONFETI_BRUJAS : CONFETI_MUERTOS,
        zIndex: 260,
        disableForReducedMotion: true,
        ...formasCelebracion(),
      });
    }
  }

  function cerrar(apagar) {
    vibrate(15);
    marcarBienvenidaVista(hoy);
    if (apagar) elegirTemporada('off');
    setVisible(false);
    onCerrar?.();
  }

  return (
    <>
      {fiesta && visible && <canvas className="tp-fiesta" ref={fiestaRef} aria-hidden="true" />}
      <div className={`modal-overlay tp-modal ${visible ? 'show' : ''}`}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tp-titulo">
          <h2 className="tp-titulo" id="tp-titulo">{titulo}</h2>
          <p>{texto}</p>
          <div className="tp-opciones" ref={opcionesRef} role="radiogroup" aria-label="Tema de temporada">
            {OPCIONES.map(({ id, sub }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={elegida === id}
                className={`tp-opcion tp-${id} ${elegida === id ? 'activa' : ''}`}
                onClick={(e) => elegir(id, e)}
              >
                {id === 'brujas' ? <Calabaza svgRef={calabazaRef} /> : <Cempasuchil svgRef={florRef} />}
                <span className="tp-nombre">{NOMBRES[id]}</span>
                <span className="tp-sub">{sub}</span>
              </button>
            ))}
          </div>
          <button className="tp-listo" type="button" onClick={() => cerrar(false)}>
            {elegida === 'brujas' ? 'Me quedo con la noche de brujas' : 'Me quedo con el Día de Muertos'}
          </button>
          <button className="btn-secondary" type="button" onClick={() => cerrar(true)}>
            Prefiero la app como siempre
          </button>
          <p className="tp-nota">Lo cambias cuando quieras en <b>Perfil → Temporada</b>.</p>
        </div>
      </div>
    </>
  );
}
