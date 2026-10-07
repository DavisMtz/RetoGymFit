/**
 * Día de Muertos: la escena de la variante tradicional de la temporada.
 *
 * Una ofrenda que se mueve con el mismo aire:
 *
 *   · la guirnalda de papel picado —la misma del mes patrio— con figuras de
 *     ofrenda (calavera, cempasúchil, vela, mariposa monarca y el arco del
 *     altar), su orla de picado fino y los colores del papel de muertos;
 *   · pétalos de cempasúchil que caen —y alguna flor entera—, el camino de
 *     flor de la ofrenda;
 *   · mariposas monarca que llegan aleteando y a veces se posan en el nudo
 *     de un banderín, abriendo y cerrando las alas, antes de seguir;
 *   · la luz de las veladoras, que titila al pie de la pantalla.
 *
 * Y responde: el viento es uno solo —la ráfaga que sacude la guirnalda
 * también se lleva los pétalos, y al cambiar de pestaña sopla una ráfaga en
 * la dirección del paso (evento 'rgf-paso', lo manda App)—; tocar un
 * banderín lo mece y la onda corre por la cuerda, y si había una monarca
 * posada ahí, se va; al cerrar la celebración de un registro llueve flor y
 * salen monarcas (evento 'rgf-festejo', lo manda Hoy).
 */
import { useEffect, useRef } from 'react';
import PapelPicado, { FIGURAS_MUERTOS } from './PapelPicado';
import { COLORES_PAPEL_MUERTOS } from '../config/temporada';
import {
  petalosDeCempasuchil, sacudirPapelPicado, encenderVeladora, retirarTemporada,
} from '../lib/anim';

/** La fila de banderines que monta PapelPicado (solo hay una a la vez). */
const filaDeBanderines = () => document.querySelector('.papel-picado .pp-fila');

/**
 * Dónde se puede posar una monarca: el nudo de cada banderín, que es el
 * punto del que cuelga y no se mueve aunque el banderín se meza.
 */
function posaderos() {
  const fila = filaDeBanderines();
  if (!fila) return [];
  return Array.from(fila.querySelectorAll('.pp-nudo')).map((nudo) => {
    const r = nudo.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + (parseFloat(getComputedStyle(nudo).paddingTop) || 0) };
  });
}

export default function DiaDeMuertos({ saliendo = false, grande = false }) {
  const raizRef = useRef(null);
  const lienzoRef = useRef(null);
  const veladoraRef = useRef(null);

  useEffect(() => {
    // El 1 y el 2 de noviembre cae más flor y llegan más monarcas.
    const vuelos = petalosDeCempasuchil(lienzoRef.current, { abundancia: grande ? 2.4 : 1, monarcas: true, posaderos });
    const veladora = encenderVeladora(veladoraRef.current);

    const alFestejo = () => vuelos.festejo();

    // Ir a la pestaña de la derecha es como si el aire viniera de allá: la
    // onda entra por ese lado de la cuerda y los pétalos se van al otro.
    const alPaso = (e) => {
      const d = e.detail?.direccion;
      if (!d) return;
      vuelos.soplar(d);
      sacudirPapelPicado(filaDeBanderines(), { desde: d > 0 ? 'end' : 'start', signo: d > 0 ? 1 : -1, fuerza: 7 });
    };

    // Tocar un banderín lo mece hacia el lado contrario al dedo. El
    // listener es pasivo y no toca nada que sea un botón o un enlace.
    const alTocar = (e) => {
      if (e.target.closest?.('button, a, input, textarea, select, label, [role="button"]')) return;
      const fila = filaDeBanderines();
      if (!fila) return;
      const banderines = Array.from(fila.querySelectorAll('.pp-banderin'));
      const i = banderines.findIndex((b) => {
        const r = b.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (i === -1) return;
      const r = banderines[i].getBoundingClientRect();
      sacudirPapelPicado(fila, { desde: i, signo: e.clientX < r.left + r.width / 2 ? -1 : 1, fuerza: 11 });
      vuelos.espantar(posaderos()[i]);
    };

    window.addEventListener('rgf-festejo', alFestejo);
    window.addEventListener('rgf-paso', alPaso);
    window.addEventListener('pointerdown', alTocar, { passive: true });
    return () => {
      window.removeEventListener('rgf-festejo', alFestejo);
      window.removeEventListener('rgf-paso', alPaso);
      window.removeEventListener('pointerdown', alTocar);
      vuelos();
      if (veladora) veladora();
    };
  }, [grande]);

  const salio = useRef(false);
  useEffect(() => {
    if (saliendo) salio.current = true;
    if (saliendo || salio.current) retirarTemporada(raizRef.current, saliendo);
  }, [saliendo]);

  return (
    <>
      <PapelPicado saliendo={saliendo} colores={COLORES_PAPEL_MUERTOS} figuras={FIGURAS_MUERTOS} />
      <div className="dia-muertos" ref={raizRef} aria-hidden="true">
        {/* La capa se apaga al salir; la luz de adentro es la que titila: si
            fueran el mismo elemento, el fundido de salida mataría el titileo. */}
        <div data-capa>
          <div className="dm-veladora" ref={veladoraRef} />
        </div>
        <canvas className="dm-petalos" ref={lienzoRef} data-capa />
      </div>
    </>
  );
}
