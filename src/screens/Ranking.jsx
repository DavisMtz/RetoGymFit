/**
 * Ranking: clasificación semanal/mensual, bote acumulado y actividad reciente.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, getInitials, Header, StatusStrip, RankSkeleton } from '../components/ui';
import { obtenerRankingSemanal, obtenerRankingMensual, obtenerBote, obtenerActividadReciente } from '../data/queries';
import { hoyMX, semanaISO } from '../lib/dates';

export default function Ranking() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('semana');
  const [ranking, setRanking] = useState(null);
  const [rankingMes, setRankingMes] = useState(null);
  const [bote, setBote] = useState(null);
  const [ticker, setTicker] = useState([]);
  const [girando, setGirando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [sem, b, act] = await Promise.all([
        obtenerRankingSemanal(reto),
        obtenerBote(reto.id),
        obtenerActividadReciente(reto.id),
      ]);
      setRanking(sem);
      setBote(b);
      setTicker(act);
    } catch {
      toast('Error al cargar el ranking', true);
      setRanking([]);
    }
  }, [reto, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (tab === 'mes' && rankingMes === null) {
      obtenerRankingMensual(reto).then(setRankingMes).catch(() => setRankingMes([]));
    }
  }, [tab, rankingMes, reto]);

  const lista = tab === 'semana' ? ranking : rankingMes;
  const etiqueta = tab === 'semana'
    ? `Semana ${String(semanaISO(hoyMX())).padStart(2, '0')} · ${hoyMX().slice(0, 4)}`
    : new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());

  const iconos = Object.fromEntries(reto.actividades.map((a) => [a.id, a.icono]));

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <div className="jackpot">
        <div className="jackpot-eyebrow">Bote acumulado</div>
        <div className="jackpot-amount">
          <sup>$</sup>
          {bote === null ? '—' : bote.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </div>
        <div className="jackpot-meta">Pesos · Premio del reto · 50 / 30 / 20</div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Clasificación</h2>
          <button
            className={`refresh-btn ${girando ? 'spin' : ''}`}
            type="button"
            aria-label="Refrescar"
            onClick={async () => {
              vibrate(); setGirando(true); setRankingMes(null);
              await cargar();
              setTimeout(() => setGirando(false), 900);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 12a9 9 0 0115.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 01-15.36 6.36L3 16M3 21v-5h5" /></svg>
          </button>
        </div>
        <div className="rank-tabs" role="tablist">
          <button className={`rank-tab ${tab === 'semana' ? 'active' : ''}`} role="tab" onClick={() => { vibrate(); setTab('semana'); }}>Esta semana</button>
          <button className={`rank-tab ${tab === 'mes' ? 'active' : ''}`} role="tab" onClick={() => { vibrate(); setTab('mes'); }}>Este mes</button>
        </div>
        <div className="rank-period-label">{etiqueta}</div>
        <ul className="rank-list">
          {lista === null && <RankSkeleton />}
          {lista !== null && !lista.length && <li className="rank-empty">Sin datos — sé quien abra el marcador.</li>}
          {(lista || []).map((r, i) => (
            <li
              className={`rank-row ${i < 3 ? `top-${i + 1}` : ''} ${r.usuarioId === usuario.id ? 'you' : ''}`}
              key={r.nombre}
              style={{ animationDelay: `${Math.min(i * 0.06, 0.5)}s` }}
            >
              <div className="rank-pos">{i + 1}</div>
              <div className="rank-av">{getInitials(r.nombre)}</div>
              <div className="rank-info">
                <div className="rank-name">{r.nombre}</div>
                <div className="rank-cal">
                  <span>{(r.calorias || 0).toLocaleString('es-MX')} kcal</span>
                  {r.puntosExtra > 0 && <span className="rank-extra">⭐ +{r.puntosExtra} pto</span>}
                </div>
              </div>
              <div className={`rank-days ${r.dias >= reto.metaDiasSemana ? 'full' : ''}`}>{r.dias}d</div>
            </li>
          ))}
        </ul>
      </section>

      {ticker.length > 0 && (
        <div className="activity-ticker">
          <div className="ticker-track">
            {[...ticker, ...ticker].map((e, i) => (
              <span className="ticker-item" key={i}>
                <span className="ticker-dot" />
                {iconos[e.tipo] || '💪'} <span className="ticker-name">{e.nombre}</span>
                <span className="ticker-sep">·</span>
                {e.calorias > 0 ? `${e.calorias} kcal` : e.tipo}
                <span className="ticker-sep">·</span> hace {e.hace}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
