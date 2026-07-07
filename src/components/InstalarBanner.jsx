/**
 * Banner discreto de "instala la app + activa notificaciones".
 *
 * Reglas para no ser invasivo:
 *  - No aparece si la app ya corre instalada (display-mode: standalone).
 *  - Aparece hasta la 2ª visita y tras unos segundos de uso.
 *  - "Ahora no" lo pospone 3 días; a la 3ª vez que lo cierras, no vuelve.
 *  - En Android usa el prompt nativo (beforeinstallprompt); en iPhone
 *    muestra los pasos de Safari (Compartir → Agregar a pantalla de inicio).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vibrate } from './ui';
import { entradaBanner, salidaBanner } from '../lib/anim';

const KEY = 'rgf_instalar_v1'; // { visitas, cierres, posponerHasta }

function leer() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function guardar(datos) {
  localStorage.setItem(KEY, JSON.stringify({ ...leer(), ...datos }));
}

const esInstalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstalarBanner() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [pasosIOS, setPasosIOS] = useState(false);
  const promptRef = useRef(null); // evento beforeinstallprompt (Android/Chrome)
  const bannerRef = useRef(null);

  useEffect(() => {
    if (esInstalada()) return undefined;
    const est = leer();
    const visitas = (est.visitas || 0) + 1;
    guardar({ visitas });
    if ((est.cierres || 0) >= 3) return undefined;               // ya dijo que no 3 veces
    if (est.posponerHasta && Date.now() < est.posponerHasta) return undefined;
    if (visitas < 2) return undefined;                           // primera visita: sin ruido

    const onPrompt = (e) => { e.preventDefault(); promptRef.current = e; };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const t = setTimeout(() => setVisible(true), 6000);          // deja usar la app primero
    return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onPrompt); };
  }, []);

  useEffect(() => {
    if (visible) entradaBanner(bannerRef.current);
  }, [visible]);

  const cerrar = useCallback(async (definitivo) => {
    vibrate(10);
    const est = leer();
    guardar({
      cierres: (est.cierres || 0) + 1,
      posponerHasta: Date.now() + (definitivo ? 365 : 3) * 24 * 60 * 60 * 1000,
    });
    await salidaBanner(bannerRef.current);
    setVisible(false);
  }, []);

  async function instalar() {
    vibrate(20);
    if (promptRef.current) {
      // Android/Chrome: prompt nativo
      promptRef.current.prompt();
      const { outcome } = await promptRef.current.userChoice;
      promptRef.current = null;
      if (outcome === 'accepted') {
        guardar({ cierres: 9 }); // instalada: no volver a mostrar
        await salidaBanner(bannerRef.current);
        setVisible(false);
      }
      return;
    }
    // iPhone/Safari (o navegador sin prompt): mostrar pasos
    setPasosIOS(true);
  }

  if (!visible) return null;

  return (
    <div className="instalar-banner" ref={bannerRef} role="dialog" aria-label="Instalar la app">
      {!pasosIOS ? (
        <>
          <div className="ib-icon">📲</div>
          <div className="ib-text">
            <b>¿Sabías que puedes instalar esta app?</b>
            <span>Queda en tu pantalla de inicio, abre a pantalla completa y puedes recibir recordatorios.</span>
          </div>
          <div className="ib-actions">
            <button className="ib-btn primary" type="button" onClick={instalar}>Instalar</button>
            <button className="ib-btn" type="button" onClick={() => cerrar(false)}>Ahora no</button>
          </div>
        </>
      ) : (
        <>
          <div className="ib-icon">{esIOS() ? '' : '🤖'}</div>
          <div className="ib-text">
            <b>{esIOS() ? 'En iPhone (Safari):' : 'En tu navegador:'}</b>
            {esIOS() ? (
              <span>1. Toca <b>Compartir</b> (el cuadrito con flecha ↑)<br />2. Elige <b>“Agregar a pantalla de inicio”</b><br />3. Abre la app desde el ícono y activa las notificaciones en Perfil 🔔</span>
            ) : (
              <span>Abre el menú <b>⋮</b> del navegador y elige <b>“Instalar aplicación”</b> o “Agregar a pantalla principal”. Después activa las notificaciones en Perfil 🔔</span>
            )}
          </div>
          <div className="ib-actions">
            <button className="ib-btn primary" type="button" onClick={() => { cerrar(true); navigate('/perfil'); }}>Ir a Perfil</button>
            <button className="ib-btn" type="button" onClick={() => cerrar(true)}>Entendido</button>
          </div>
        </>
      )}
    </div>
  );
}
