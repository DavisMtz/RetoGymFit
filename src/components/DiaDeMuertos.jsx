/**
 * Día de Muertos: la escena de la variante tradicional de la temporada.
 *
 * Dos piezas que se mueven con el mismo aire:
 *
 *   · la guirnalda de papel picado —la misma del mes patrio— con figuras de
 *     ofrenda (calavera, cempasúchil, vela y mariposa monarca) y los colores
 *     del papel de muertos: morado, rosa, naranja, amarillo, verde y azul;
 *   · pétalos de cempasúchil que caen, el camino de flor de la ofrenda.
 *
 * Cuando una ráfaga sacude la guirnalda, los pétalos se van de lado con ella
 * (evento 'rgf-rafaga', ver src/lib/anim.js).
 */
import { useEffect, useRef } from 'react';
import PapelPicado, { FIGURAS_MUERTOS } from './PapelPicado';
import { COLORES_PAPEL_MUERTOS } from '../config/temporada';
import { petalosDeCempasuchil, retirarTemporada } from '../lib/anim';

export default function DiaDeMuertos({ saliendo = false, grande = false }) {
  const raizRef = useRef(null);
  const lienzoRef = useRef(null);

  // El 1 y el 2 de noviembre cae más flor.
  useEffect(
    () => petalosDeCempasuchil(lienzoRef.current, { abundancia: grande ? 2.4 : 1 }),
    [grande],
  );

  const salio = useRef(false);
  useEffect(() => {
    if (saliendo) salio.current = true;
    if (saliendo || salio.current) retirarTemporada(raizRef.current, saliendo);
  }, [saliendo]);

  return (
    <>
      <PapelPicado saliendo={saliendo} colores={COLORES_PAPEL_MUERTOS} figuras={FIGURAS_MUERTOS} />
      <div className="dia-muertos" ref={raizRef} aria-hidden="true">
        <canvas className="dm-petalos" ref={lienzoRef} data-capa />
      </div>
    </>
  );
}
