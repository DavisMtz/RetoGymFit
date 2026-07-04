/**
 * PUENTE FIREBASE → GOOGLE SHEETS — RETO GYM 2026
 *
 * UN SOLO script para las DOS hojas (Mixto y Damas): la app en Firebase
 * manda cada registro nuevo por HTTP y este script lo agrega a la pestaña
 * "Registros" de la hoja correcta, con el mismo formato de siempre:
 *
 *   A: Timestamp | B: Usuario | C: Fecha | D: Tipo | E: Minutos
 *   F: Kcal      | G: Evidencia | H: Estatus | I: Notas
 *
 * INSTALACIÓN (una sola vez, ~3 minutos):
 *  1. Entra a https://script.google.com → Nuevo proyecto.
 *  2. Borra el contenido y pega este archivo completo. Guarda (Ctrl+S).
 *  3. Implementar → Nueva implementación → tipo "Aplicación web":
 *       - Ejecutar como: Tú (tu cuenta, dueña de las hojas)
 *       - Quién tiene acceso: Cualquier persona
 *  4. Autoriza los permisos cuando lo pida.
 *  5. Copia la URL del Web App (termina en /exec) y pégasela a Claude
 *     para conectarla a la app.
 *
 * Los IDs de las hojas y el token ya vienen configurados — no cambies nada.
 */

var TOKEN = '7ddf4b0e8c45ea15ca556a993ccd1074';

var HOJAS = {
  mixto: '1E46f6q3q1kLl4E04uX1i3a0HENZpmcOVatDtbd0E8TQ',
  damas: '1JXd0uyYTzNNgdHuiY-Ndk3Mt5pt_TM5BvswbMGI1zpo',
};

function doPost(e) {
  var out = { success: false };
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) {
      out.message = 'Token inválido';
      return responder(out);
    }

    if (body.accion === 'registro') {
      var sheetId = HOJAS[body.retoId];
      if (!sheetId) throw new Error('Reto desconocido: ' + body.retoId);

      var r = body.registro;
      var ss = SpreadsheetApp.openById(sheetId);
      var hoja = ss.getSheetByName('Registros');
      if (!hoja) throw new Error("No existe la pestaña 'Registros' en la hoja " + body.retoId);

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

/** Prueba rápida desde el editor: Ejecutar → probarConexion */
function probarConexion() {
  for (var reto in HOJAS) {
    var ss = SpreadsheetApp.openById(HOJAS[reto]);
    var hoja = ss.getSheetByName('Registros');
    Logger.log(reto + ': ' + ss.getName() + ' → pestaña Registros ' + (hoja ? 'OK ✓' : 'NO ENCONTRADA ✗'));
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
