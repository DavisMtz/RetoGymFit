/**
 * PUENTE FIREBASE → GOOGLE SHEETS — RETO GYM 2026
 *
 * Este script vive en la MISMA hoja de cálculo de siempre (una copia por
 * hoja: Mixto y Damas). La app en Firebase le manda cada registro nuevo
 * por HTTP y este script lo agrega a la pestaña "Registros" con el mismo
 * formato de columnas que usaba la app anterior:
 *
 *   A: Timestamp | B: Usuario | C: Fecha | D: Tipo | E: Minutos
 *   F: Kcal      | G: Evidencia | H: Estatus | I: Notas
 *
 * INSTALACIÓN (en cada hoja):
 *  1. Extensiones → Apps Script → pega este archivo.
 *  2. Cambia TOKEN por un valor secreto propio (el mismo que pongas en
 *     VITE_SHEETS_WEBHOOK_TOKEN del .env de la app).
 *  3. Implementar → Nueva implementación → "Aplicación web"
 *       - Ejecutar como: Tú
 *       - Acceso: Cualquier persona
 *  4. Copia la URL del Web App a VITE_SHEETS_WEBHOOK_MIXTO o _DAMAS.
 *
 * Nota: el menú ADMIN GYM y el sidebar de pagos de tu script original
 * pueden seguir viviendo en el mismo proyecto sin conflicto. Los pagos
 * ahora se registran también en Firestore (colección `pagos`) para que
 * la app muestre el bote; puedes hacerlo desde la consola de Firebase
 * o adaptar guardarPago() para escribir en ambos lados.
 */

var TOKEN = 'CAMBIA-ESTE-TOKEN';

function doPost(e) {
  var out = { success: false };
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      out.message = 'Token inválido';
      return responder(out);
    }

    if (body.accion === 'registro') {
      var r = body.registro;
      var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Registros');
      if (!hoja) throw new Error("No existe la hoja 'Registros'");

      // Evitar duplicados si la app reintenta el envío
      var datos = hoja.getDataRange().getValues();
      for (var i = 1; i < datos.length; i++) {
        var fechaFila = datos[i][2];
        var fechaStr = fechaFila instanceof Date
          ? Utilities.formatDate(fechaFila, 'America/Mexico_City', 'yyyy-MM-dd')
          : String(fechaFila);
        if (datos[i][1] === r.nombre && fechaStr === r.fecha) {
          out.success = true;
          out.message = 'Duplicado ignorado';
          return responder(out);
        }
      }

      // Fecha a mediodía (mismo truco anti-zona-horaria de siempre)
      var p = r.fecha.split('-');
      var fechaGuardar = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);

      hoja.appendRow([
        new Date(),
        r.nombre,
        fechaGuardar,
        r.tipo,
        Number(r.minutos) || 0,
        Number(r.calorias) || 0,
        r.evidencia || '',
        r.estatus,
        r.notas || '',
      ]);
      out.success = true;
    } else {
      out.message = 'Acción desconocida';
    }
  } catch (err) {
    out.message = String(err);
  }
  return responder(out);
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
