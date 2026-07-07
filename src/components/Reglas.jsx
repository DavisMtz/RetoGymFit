/**
 * Reglamento interactivo: hoja deslizante con las reglas oficiales del reto
 * organizadas en acordeones. Se puede abrir desde el header (📖) o desde
 * la pantalla de Perfil.
 */
import { useState, useEffect } from 'react';
import { vibrate } from './ui';
import { reglasDelReto, FRASE_REGLAMENTO } from '../config/reglas';
import { diasHasta } from '../lib/dates';

function fechaCorta(iso) {
  return new Date(iso + 'T12:00:00')
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/\./g, '')
    .toUpperCase();
}

export default function ReglasSheet({ reto, abierto, onClose }) {
  const [seccion, setSeccion] = useState(null);
  const secciones = reglasDelReto(reto);

  // Bloquea el scroll del fondo mientras la hoja está abierta
  useEffect(() => {
    if (!abierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [abierto]);

  // Al abrir, siempre arranca con todo colapsado
  useEffect(() => { if (abierto) setSeccion(null); }, [abierto]);

  const toggle = (id) => {
    vibrate(12);
    setSeccion((s) => (s === id ? null : id));
  };

  return (
    <div className={`sheet-overlay ${abierto ? 'show' : ''}`} onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Reglamento del reto" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <header className="sheet-head">
          <div>
            <div className="sheet-eyebrow">Reglamento oficial</div>
            <h2 className="sheet-title">{reto.nombre}</h2>
            <div className="sheet-dates">
              {fechaCorta(reto.fechaInicio)} → {fechaCorta(reto.fechaFin)}
              {diasHasta(reto.fechaFin) > 0 && <span className="sheet-dates-left"> · {diasHasta(reto.fechaFin)} días restantes</span>}
            </div>
          </div>
          <button className="sheet-close" type="button" aria-label="Cerrar" onClick={() => { vibrate(10); onClose(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <div className="sheet-facts">
          <div className="fact-chip"><b>{reto.metaDiasSemana}</b> días / semana</div>
          <div className="fact-chip"><b>${reto.multaSemanal}</b> multa</div>
          <div className="fact-chip"><b>+1 pto</b> al {reto.diaBonus}º día</div>
          <div className="fact-chip"><b>50/30/20</b> premios</div>
        </div>

        <div className="sheet-body">
          {secciones.map((s, i) => {
            const abiertaSec = seccion === s.id;
            return (
              <div className={`regla-acc ${abiertaSec ? 'open' : ''}`} key={s.id} style={{ animationDelay: `${0.05 + i * 0.05}s` }}>
                <button className="regla-acc-head" type="button" aria-expanded={abiertaSec} onClick={() => toggle(s.id)}>
                  <span className="regla-acc-icon">{s.icono}</span>
                  <span className="regla-acc-titles">
                    <b>{s.titulo}</b>
                    <span>{s.resumen}</span>
                  </span>
                  <svg className="regla-acc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <div className="regla-acc-panel">
                  <ol className="regla-lista">
                    {s.items.map((item, j) => (
                      <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
                    ))}
                  </ol>
                </div>
              </div>
            );
          })}

          <p className="sheet-quote">“{FRASE_REGLAMENTO}”</p>
        </div>
      </div>
    </div>
  );
}
