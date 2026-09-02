/**
 * Aviso para quien todavía no registró su correo de recuperación.
 *
 * Sin correo, un participante que olvida su contraseña depende de que el
 * administrador le reinicie el acceso a mano. Este banner se lo recuerda una
 * vez, sin bloquear nada: se puede descartar y no vuelve a molestar.
 *
 * Reutiliza el estilo y la animación de InstalarBanner para que la app tenga
 * un solo lenguaje de avisos.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { vibrate } from './ui';
import { entradaBanner, salidaBanner } from '../lib/anim';
import { obtenerCorreo } from '../lib/recuperacion';

const KEY = 'rgf_correo_aviso_v1'; // { cierres, posponerHasta }
const POSPONER_DIAS = 7;
const MAX_CIERRES = 3;             // al 3er "ahora no", ya no insistimos

function leer() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function guardar(datos) {
  localStorage.setItem(KEY, JSON.stringify({ ...leer(), ...datos }));
}

/** Para que Perfil pueda callar el aviso en cuanto el correo queda guardado. */
export function silenciarAvisoCorreo() {
  guardar({ cierres: 99 });
}

export default function CorreoBanner() {
  const navigate = useNavigate();
  const { reto, usuario, autenticado, esAdmin } = useAuth();
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef(null);

  useEffect(() => {
    // El admin no es un participante: no tiene perfil que recuperar.
    if (!autenticado || esAdmin || !reto || !usuario?.id) return undefined;

    const est = leer();
    if ((est.cierres || 0) >= MAX_CIERRES) return undefined;
    if (est.posponerHasta && Date.now() < est.posponerHasta) return undefined;

    let activo = true;
    const t = setTimeout(async () => {
      const email = await obtenerCorreo(reto.id, usuario.id);
      if (activo && !email) setVisible(true);
    }, 4000); // deja que la app cargue antes de pedir nada

    return () => { activo = false; clearTimeout(t); };
  }, [autenticado, esAdmin, reto, usuario?.id]);

  useEffect(() => {
    if (visible) entradaBanner(bannerRef.current);
  }, [visible]);

  const cerrar = useCallback(async () => {
    vibrate(10);
    const est = leer();
    guardar({
      cierres: (est.cierres || 0) + 1,
      posponerHasta: Date.now() + POSPONER_DIAS * 24 * 60 * 60 * 1000,
    });
    await salidaBanner(bannerRef.current);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="instalar-banner" ref={bannerRef} role="dialog" aria-label="Registra tu correo">
      <div className="ib-icon">✉️</div>
      <div className="ib-text">
        <b>No has registrado tu correo</b>
        <span>
          Lo usamos <b>solo</b> si olvidas tu contraseña: te mandamos un código para
          volver a entrar sin depender de nadie.
        </span>
      </div>
      <div className="ib-actions">
        <button
          className="ib-btn primary"
          type="button"
          onClick={() => { vibrate(20); silenciarAvisoCorreo(); navigate('/perfil'); }}
        >
          Registrar
        </button>
        <button className="ib-btn" type="button" onClick={cerrar}>Ahora no</button>
      </div>
    </div>
  );
}
