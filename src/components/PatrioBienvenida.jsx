/**
 * Modal de bienvenida al tema patrio. Se muestra UNA sola vez por temporada
 * (la marca es el año, así vuelve a salir el septiembre siguiente).
 *
 * El emblema es la campana de Dolores, la que se toca en el Grito. Se eligió
 * a propósito en lugar del escudo nacional: la Ley sobre el Escudo, la
 * Bandera y el Himno Nacionales regula el uso del águila, y una app de un
 * reto de gimnasio no tiene por qué meterse ahí. La campana es igual de
 * reconocible y no está restringida.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { vibrate } from './ui';
import { trazarEmblema, cohetesDelGrito } from '../lib/anim';
import { hoyMX } from '../lib/dates';
import { saludoPatrio, esNocheDelGrito, CONFETI_PATRIO, PALETA } from '../config/patrio';
import { marcarBienvenidaVista } from '../lib/patrio';

const reducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Campana() {
  return (
    <svg className="patrio-emblema" viewBox="0 0 96 96" fill="none" focusable="false" aria-hidden="true">
      {/* Las ondas del repique: salen en cada campanada y se apagan solas */}
      <circle data-onda cx="48" cy="48" r="30" stroke={PALETA.oro} strokeWidth="1.6" opacity="0" />
      <circle data-onda cx="48" cy="48" r="30" stroke="#ffffff" strokeWidth="1.2" opacity="0" />
      {/* Rayos de la fiesta */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i - Math.PI / 2;
        const c = [PALETA.verdeVivo, PALETA.oro, PALETA.rojoVivo][i % 3];
        return (
          <line
            key={i}
            data-trazo
            data-rayo
            x1={48 + Math.cos(a) * 33} y1={46 + Math.sin(a) * 33}
            x2={48 + Math.cos(a) * 42} y2={46 + Math.sin(a) * 42}
            stroke={c} strokeWidth="3" strokeLinecap="round"
          />
        );
      })}
      {/* El remate NO se mece: es de donde cuelga la campana */}
      <circle data-relleno cx="48" cy="22" r="3.2" fill={PALETA.verdeVivo} />
      {/* Todo lo que cuelga del yugo, que es lo que repica */}
      <g data-campana>
        <path
          data-trazo
          d="M32 62 Q32 34 48 30 Q64 34 64 62"
          stroke={PALETA.oro} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"
        />
        <path data-trazo d="M27 62 H69" stroke={PALETA.oro} strokeWidth="3.4" strokeLinecap="round" />
        <path data-trazo d="M48 30 V24" stroke={PALETA.oro} strokeWidth="3.4" strokeLinecap="round" />
        {/* Franjas de la bandera en la falda */}
        <rect data-relleno x="34" y="55" width="9" height="4" rx="1.4" fill={PALETA.verdeVivo} />
        <rect data-relleno x="44" y="55" width="9" height="4" rx="1.4" fill="#ffffff" />
        <rect data-relleno x="54" y="55" width="8" height="4" rx="1.4" fill={PALETA.rojoVivo} />
        {/* El badajo va aparte: llega tarde al golpe, y esa demora es la campana */}
        <g data-badajo>
          <circle data-relleno cx="48" cy="68" r="4" fill={PALETA.oro} />
        </g>
      </g>
    </svg>
  );
}

export default function PatrioBienvenida({ onCerrar }) {
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const hoy = hoyMX();
  const { titulo, texto } = saludoPatrio(hoy);
  const esGrito = esNocheDelGrito(hoy);

  useEffect(() => {
    // Un respiro antes de aparecer: que la app cargue primero.
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const pararEmblema = trazarEmblema(svgRef.current);
    if (!reducido()) {
      confetti({
        particleCount: 70,
        spread: 78,
        origin: { y: 0.35 },
        colors: CONFETI_PATRIO,
        disableForReducedMotion: true,
      });
    }
    // La noche del Grito, además, cohetes de fondo.
    const parar = esGrito ? cohetesDelGrito(canvasRef.current, CONFETI_PATRIO) : null;
    return () => { if (pararEmblema) pararEmblema(); if (parar) parar(); };
  }, [visible, esGrito]);

  function cerrar(irAPerfil) {
    vibrate(15);
    marcarBienvenidaVista(hoy);
    setVisible(false);
    onCerrar?.();
    if (irAPerfil) navigate('/perfil');
  }

  return (
    <>
      {esGrito && visible && <canvas className="patrio-cohetes" ref={canvasRef} aria-hidden="true" />}
      <div className={`modal-overlay patrio-modal ${visible ? 'show' : ''}`}>
        <div className="modal">
          <span ref={svgRef}><Campana /></span>
          <h2 className="patrio-titulo">{titulo}</h2>
          <p>{texto}</p>
          <p className="patrio-nota">
            Si prefieres la app como siempre, puedes desactivar el tema patrio
            en <b>Perfil → Tema patrio</b> cuando quieras.
          </p>
          <button className="btn-dark" type="button" onClick={() => cerrar(false)}>
            ¡Viva México! 🇲🇽
          </button>
          <button className="btn-secondary" type="button" onClick={() => cerrar(true)}>
            Desactivarlo en Perfil
          </button>
        </div>
      </div>
    </>
  );
}
