/**
 * Ranking: clasificación semanal/mensual, bote acumulado y actividad reciente.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar, Header, StatusStrip, RankSkeleton, useCountUp } from '../components/ui';
import { obtenerRankingSemanal, obtenerRankingMensual, obtenerBote, obtenerActividadReciente, obtenerUsuariosActivos } from '../data/queries';
import { hoyMX, semanaISO } from '../lib/dates';

export default function Ranking() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('semana');
  const [ranking, setRanking] = useState(null);
  const [rankingMes, setRankingMes] = useState(null);
  const [bote, setBote] = useState(null);
  const [ticker, setTicker] = useState([]);
  const [fotos, setFotos] = useState({}); // usuarioId → photoURL
  const [girando, setGirando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [sem, b, act, usuarios] = await Promise.all([
        obtenerRankingSemanal(reto),
        obtenerBote(reto.id),
        obtenerActividadReciente(reto.id),
        obtenerUsuariosActivos(reto.id),
      ]);
      setRanking(sem);
      setBote(b);
      setTicker(act);
      setFotos(Object.fromEntries(usuarios.filter((u) => u.photoURL).map((u) => [u.id, u.photoURL])));
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

  const boteAnimado = useCountUp(bote, 1600);

  // Podio (top 3) + resto de la lista, y tu duelo directo con quien va arriba
  const podio = (lista || []).slice(0, 3);
  const resto = (lista || []).slice(3);
  const miIdx = (lista || []).findIndex((r) => r.usuarioId === usuario.id);
  let duelo = null;
  if (lista && lista.length > 1 && miIdx !== -1) {
    if (miIdx === 0) {
      const segundo = lista[1];
      const ventaja = lista[0].dias - segundo.dias;
      duelo = ventaja > 0
        ? { texto: <>👑 Vas al frente — <b>{segundo.nombre.split(' ')[0]}</b> te sigue a <b>{ventaja} día{ventaja !== 1 ? 's' : ''}</b>. No aflojes.</> }
        : { texto: <>👑 Vas al frente, pero <b>{segundo.nombre.split(' ')[0]}</b> te pisa los talones. Defiende tu corona.</> };
    } else {
      const rival = lista[miIdx - 1];
      const faltan = rival.dias - lista[miIdx].dias;
      duelo = faltan > 0
        ? { texto: <>⚔️ Estás a <b>{faltan} día{faltan !== 1 ? 's' : ''}</b> de alcanzar a <b>{rival.nombre.split(' ')[0]}</b> (#{miIdx}). ¡Dale caza!</> }
        : { texto: <>⚔️ Empate en días con <b>{rival.nombre.split(' ')[0]}</b> — las kcal deciden el #{miIdx}. Suda más.</> };
    }
  }

  const medallas = ['🥇', '🥈', '🥉'];
  // Orden visual del podio: 2º — 1º — 3º
  const ordenPodio = [podio[1], podio[0], podio[2]].filter(Boolean);

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <div className="jackpot">
        <div className="jackpot-eyebrow">Bote acumulado</div>
        <div className="jackpot-amount">
          <sup>$</sup>
          {boteAnimado === null ? '—' : boteAnimado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        {duelo && <div className="duelo-strip">{duelo.texto}</div>}

        {podio.length > 0 && (
          <div className="podium" key={tab}>
            {ordenPodio.map((r) => {
              const pos = podio.indexOf(r);
              return (
                <div
                  className={`podium-col p-${pos + 1} ${r.usuarioId === usuario.id ? 'you' : ''}`}
                  key={r.nombre}
                >
                  {pos === 0 && <div className="podium-crown">👑</div>}
                  <div className="podium-av-wrap">
                    <Avatar nombre={r.nombre} url={fotos[r.usuarioId]} className="podium-av" />
                  </div>
                  <div className="podium-name">{r.nombre.split(' ')[0]}</div>
                  <div className="podium-kcal">{(r.calorias || 0).toLocaleString('es-MX')} kcal{r.puntosExtra > 0 ? ' · ⭐' : ''}</div>
                  <div className="podium-base">
                    <span className="podium-medal">{medallas[pos]}</span>
                    <span className="podium-days">{r.dias}d</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ul className="rank-list">
          {lista === null && <RankSkeleton />}
          {lista !== null && !lista.length && <li className="rank-empty">Sin datos — sé quien abra el marcador.</li>}
          {resto.map((r, i) => (
            <li
              className={`rank-row ${r.usuarioId === usuario.id ? 'you' : ''}`}
              key={r.nombre}
              style={{ animationDelay: `${Math.min(0.3 + i * 0.06, 0.8)}s` }}
            >
              <div className="rank-pos">{i + 4}</div>
              <Avatar nombre={r.nombre} url={fotos[r.usuarioId]} className="rank-av" />
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
