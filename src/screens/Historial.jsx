/**
 * Historial: todos tus registros agrupados por semana, con estatus.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, Header, StatusStrip } from '../components/ui';
import { revelarTitulo, revelarLista } from '../lib/anim';
import { obtenerHistorial } from '../data/queries';
import { semanaISO, anioISO, aFecha, DIAS_CORTOS } from '../lib/dates';

export default function Historial() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const [registros, setRegistros] = useState(null);

  useEffect(() => {
    obtenerHistorial(reto.id, usuario.id, 200)
      .then(setRegistros)
      .catch(() => { toast('Error al cargar el historial', true); setRegistros([]); });
  }, [reto, usuario, toast]);

  const tituloRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => revelarTitulo(tituloRef.current, { retraso: 0.2 }), []);
  // La bitácora puede tener meses de filas: las de arriba entran solas y el
  // resto va apareciendo conforme bajas. Nada se anima dos veces.
  useEffect(() => {
    if (!registros?.length) return undefined;
    return revelarLista(listaRef.current, '.hist-row', { cascada: 0.04, y: 18 });
  }, [registros]);

  const iconos = Object.fromEntries(reto.actividades.map((a) => [a.id, a.icono]));

  // Agrupar por semana ISO (ya vienen ordenados desc)
  const semanas = [];
  (registros || []).forEach((r) => {
    const key = `${anioISO(r.fecha)}-S${String(semanaISO(r.fecha)).padStart(2, '0')}`;
    let grupo = semanas.find((s) => s.key === key);
    if (!grupo) { grupo = { key, semana: semanaISO(r.fecha), registros: [] }; semanas.push(grupo); }
    grupo.registros.push(r);
  });

  const claseEstatus = (e) =>
    e === 'CUMPLE' ? 'cumple' : e === 'JUSTIFICADO' ? 'justificado' : e === 'NO CUMPLE' ? 'nocumple' : '';

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <section className="hero" style={{ padding: '24px 22px 20px' }}>
        <div className="hero-eyebrow">Tu bitácora</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }} ref={tituloRef}>Historial de <em>batalla.</em></h1>
        <p className="hero-sub">Cada registro cuenta tu historia en el reto.</p>
      </section>

      {registros === null && <div className="rank-empty">Cargando historial…</div>}
      {registros !== null && !registros.length && (
        <div className="rank-empty">Aún no tienes registros. ¡Hoy es un gran día para empezar!</div>
      )}

      <div className="hist-lista" ref={listaRef}>
      {semanas.map((s) => {
        const diasCumplidos = new Set(
          s.registros.filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO').map((r) => r.fecha),
        ).size;
        return (
          <div className="hist-week" key={s.key}>
            <div className="hist-week-label">
              Semana {String(s.semana).padStart(2, '0')} · <b>{diasCumplidos}/{reto.metaDiasSemana} días</b>
            </div>
            {s.registros.map((r) => {
              const f = aFecha(r.fecha);
              const diaIdx = f.getDay() === 0 ? 6 : f.getDay() - 1;
              return (
                <div className="hist-row" key={r.id}>
                  <div className="hist-icon">{iconos[r.tipo] || '💪'}</div>
                  <div className="hist-info">
                    <div className="hist-tipo">
                      {r.tipo}{' '}
                      <span className={`chip-estatus ${claseEstatus(r.estatus)}`}>{r.estatus}</span>
                    </div>
                    <div className="hist-meta">
                      {r.minutos > 0 ? `${Math.floor(r.minutos / 60)}h ${r.minutos % 60}m · ` : ''}
                      {r.calorias > 0 ? `${r.calorias} kcal` : 'Justificado'}
                      {r.notas ? ` · “${r.notas}”` : ''}
                    </div>
                  </div>
                  <div className="hist-fecha">
                    <b>{f.getDate()} {f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}</b>
                    <span>{DIAS_CORTOS[diaIdx]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      </div>
    </div>
  );
}
