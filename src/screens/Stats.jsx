/**
 * Estadísticas personales: tiles de resumen, cumplimiento de las últimas
 * 8 semanas (barras vs. línea de meta) y distribución por tipo de actividad.
 */
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, Header, StatusStrip, useCountUp } from '../components/ui';
import { obtenerHistorial } from '../data/queries';
import { calcularRacha, mejorRacha, semanaISO, anioISO, hoyMX, lunesDe, sumarDias } from '../lib/dates';

export default function Stats() {
  const { reto, usuario } = useAuth();
  const toast = useToast();
  const [registros, setRegistros] = useState(null);

  useEffect(() => {
    obtenerHistorial(reto.id, usuario.id, 400)
      .then(setRegistros)
      .catch(() => { toast('Error al cargar estadísticas', true); setRegistros([]); });
  }, [reto, usuario, toast]);

  const stats = useMemo(() => {
    if (!registros) return null;
    const cumplidos = registros.filter((r) => r.estatus === 'CUMPLE' || r.estatus === 'JUSTIFICADO');
    const activos = registros.filter((r) => r.tipo === 'Gimnasio' || r.tipo === 'Fuera del Gym');
    const fechasCumplidas = cumplidos.map((r) => r.fecha);

    // Últimas 8 semanas: días cumplidos por semana
    const hoy = hoyMX();
    const semanas = [];
    for (let i = 7; i >= 0; i--) {
      const lunes = sumarDias(lunesDe(hoy), -7 * i);
      const domingo = sumarDias(lunes, 6);
      const dias = new Set(
        cumplidos.filter((r) => r.fecha >= lunes && r.fecha <= domingo).map((r) => r.fecha),
      ).size;
      semanas.push({ label: `S${String(semanaISO(lunes)).padStart(2, '0')}`, key: `${anioISO(lunes)}-${semanaISO(lunes)}`, dias });
    }

    // Distribución por tipo
    const porTipo = {};
    registros.forEach((r) => { porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; });
    const distribucion = reto.actividades
      .map((a) => ({ ...a, n: porTipo[a.id] || 0 }))
      .filter((a) => a.n > 0)
      .sort((a, b) => b.n - a.n);

    const semanasCumplidas = semanas.filter((s) => s.dias >= reto.metaDiasSemana).length;

    return {
      totalDias: new Set(fechasCumplidas).size,
      totalKcal: activos.reduce((t, r) => t + (Number(r.calorias) || 0), 0),
      totalMin: activos.reduce((t, r) => t + (Number(r.minutos) || 0), 0),
      racha: calcularRacha(fechasCumplidas),
      mejor: mejorRacha(fechasCumplidas),
      semanas,
      semanasCumplidas,
      distribucion,
      maxTipo: Math.max(1, ...distribucion.map((d) => d.n)),
    };
  }, [registros, reto]);

  const diasAnim = useCountUp(stats ? stats.totalDias : null, 900);
  const kcalAnim = useCountUp(stats ? stats.totalKcal : null, 1500);
  const hrsAnim = useCountUp(stats ? Math.round(stats.totalMin / 60) : null, 1200);

  return (
    <div className="app-shell">
      <Header reto={reto} />
      <StatusStrip />

      <section className="hero" style={{ padding: '24px 22px 20px' }}>
        <div className="hero-eyebrow">Tus números</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(28px, 8vw, 36px)' }}>Datos que <em>no mienten.</em></h1>
        <p className="hero-sub">Todo lo que has construido en el reto, medido.</p>
      </section>

      {!stats && <div className="rank-empty">Calculando…</div>}

      {stats && (
        <>
          <div className="stats-grid">
            <div className="stat-tile" style={{ animationDelay: '0.05s' }}>
              <div className="st-num">{Math.round(diasAnim)}</div>
              <div className="st-label">Días cumplidos<br />en total</div>
            </div>
            <div className="stat-tile" style={{ animationDelay: '0.12s' }}>
              <div className="st-num">{stats.racha}<small>días</small></div>
              <div className="st-label">Racha<br />actual 🔥</div>
            </div>
            <div className="stat-tile" style={{ animationDelay: '0.19s' }}>
              <div className="st-num">{Math.round(kcalAnim).toLocaleString('es-MX')}</div>
              <div className="st-label">Kcal quemadas<br />acumuladas</div>
            </div>
            <div className="stat-tile" style={{ animationDelay: '0.26s' }}>
              <div className="st-num">{Math.round(hrsAnim)}<small>hrs</small></div>
              <div className="st-label">Horas de<br />entrenamiento</div>
            </div>
            <div className="stat-tile" style={{ animationDelay: '0.33s' }}>
              <div className="st-num">{stats.mejor}<small>días</small></div>
              <div className="st-label">Mejor racha<br />histórica</div>
            </div>
            <div className="stat-tile" style={{ animationDelay: '0.4s' }}>
              <div className="st-num">{stats.semanasCumplidas}<small>/8</small></div>
              <div className="st-label">Semanas al 100<br />(últimas 8)</div>
            </div>
          </div>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Últimas 8 semanas</h2>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                Meta · {reto.metaDiasSemana} días
              </span>
            </div>
            <div className="bars" style={{ position: 'relative' }}>
              {/* Línea de meta */}
              <div
                className="meta-line"
                style={{ bottom: `calc(${(reto.metaDiasSemana / 7) * 100}% + 22px)` }}
                aria-hidden="true"
              />
              {stats.semanas.map((s) => (
                <div className="bar-col" key={s.key}>
                  <span className="bar-val">{s.dias > 0 ? s.dias : ''}</span>
                  <div
                    className={`bar ${s.dias >= reto.metaDiasSemana ? 'ok' : ''}`}
                    style={{ height: `${(s.dias / 7) * 100}%` }}
                    title={`${s.label}: ${s.dias} día${s.dias !== 1 ? 's' : ''}`}
                  />
                  <span className="bar-label">{s.label}</span>
                </div>
              ))}
            </div>
          </section>

          {stats.distribucion.length > 0 && (
            <section className="card">
              <div className="card-head"><h2 className="card-title">Por actividad</h2></div>
              <div className="tipo-dist">
                {stats.distribucion.map((d) => (
                  <div className="tipo-row" key={d.id}>
                    <span className="td-icon">{d.icono}</span>
                    <span className="td-name">{d.nombre}</span>
                    <div className="td-track">
                      <div className="td-fill" style={{ width: `${(d.n / stats.maxTipo) * 100}%` }} />
                    </div>
                    <span className="td-num">{d.n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
