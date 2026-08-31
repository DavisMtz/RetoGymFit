/**
 * Aviso de una sola vez: las fotos de perfil y del feed volvieron (migradas
 * de Firebase Storage a Cloudinary tras el corte del 2026-08-30). Se marca
 * en localStorage al cerrarlo — no vuelve a aparecer en ese dispositivo.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { vibrate } from './ui';

const KEY = 'rgf_aviso_fotos_v1';

function yaVisto() {
  try { return Boolean(localStorage.getItem(KEY)); } catch { return false; }
}
function marcarVisto() {
  try { localStorage.setItem(KEY, '1'); } catch { /* modo privado: podría reaparecer */ }
}

export default function AvisoFotos() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const yaCerroRef = useRef(false);

  useEffect(() => {
    if (yaVisto()) return undefined;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function cerrar() {
    if (yaCerroRef.current) return;
    yaCerroRef.current = true;
    vibrate(10);
    marcarVisto();
    setVisible(false);
  }

  function irAPerfil() {
    cerrar();
    navigate('/perfil');
  }

  if (!visible) return null;

  return (
    <div className="modal-overlay show">
      <div className="modal">
        <div className="modal-icon">📸</div>
        <h2>¡Las fotos ya volvieron!</h2>
        <p>
          Las fotos de perfil y las publicaciones con imagen vuelven a estar disponibles.
          Ponte una foto de perfil o comparte una publicación con foto — se ve mejor con tu cara ahí 💪
        </p>
        <button className="btn-dark" type="button" onClick={irAPerfil}>Poner mi foto de perfil</button>
        <button className="btn-secondary" type="button" onClick={cerrar}>Ahora no</button>
      </div>
    </div>
  );
}
