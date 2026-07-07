/**
 * RECORDATORIOS PUSH — RETO GYM 2026
 *
 * Envía notificaciones push (FCM) a quienes van atrasados en la semana,
 * usando los tokens que la app guarda en usuarios/{id}.fcmToken cuando el
 * participante activa las notificaciones en su Perfil.
 *
 * Vive en el MISMO proyecto de Apps Script que SheetsBridge.gs (reutiliza
 * su configuración FB_PROJECT y su autenticación idToken_ para leer
 * Firestore). Para ENVIAR push usa el token OAuth del dueño del script
 * (ScriptApp.getOAuthToken), que debe ser dueño del proyecto Firebase.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ INSTALACIÓN (una sola vez)                                        │
 * │  1. Pega este archivo como un archivo nuevo en tu proyecto de     │
 * │     script.google.com (junto a SheetsBridge.gs).                  │
 * │  2. En el editor: ⚙ Configuración del proyecto → marca            │
 * │     "Mostrar el archivo de manifiesto appsscript.json" y          │
 * │     reemplaza su contenido por:                                   │
 * │                                                                    │
 * │     {                                                              │
 * │       "timeZone": "America/Mexico_City",                          │
 * │       "exceptionLogging": "STACKDRIVER",                          │
 * │       "runtimeVersion": "V8",                                     │
 * │       "webapp": { "access": "ANYONE_ANONYMOUS",                   │
 * │                    "executeAs": "USER_DEPLOYING" },               │
 * │       "oauthScopes": [                                            │
 * │         "https://www.googleapis.com/auth/spreadsheets",           │
 * │         "https://www.googleapis.com/auth/script.external_request",│
 * │         "https://www.googleapis.com/auth/script.scriptapp",       │
 * │         "https://www.googleapis.com/auth/firebase.messaging"      │
 * │       ]                                                            │
 * │     }                                                              │
 * │                                                                    │
 * │  3. Selecciona la función  instalarTriggerPush  y ▶ Ejecuta.      │
 * │     Autoriza los permisos. Queda un trigger diario ~18:00.        │
 * │  4. (Opcional) Prueba con  probarPush  — te manda una             │
 * │     notificación a cada token registrado.                         │
 * └──────────────────────────────────────────────────────────────────┘
 */

// Meta semanal por reto (igual que en la app: src/config/retos.js)
var PUSH_RETOS = {
  mixto: { meta: 4 },
  damas: { meta: 3 },
};

var PUSH_APP_URL = 'https://retogymfit.web.app/';
var PUSH_ICONO = 'https://retogymfit.web.app/icons/icon-192.png';

/** Instala el trigger diario (corre entre 18:00 y 19:00). */
function instalarTriggerPush() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarRecordatorios') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyDays(1).atHour(18).create();
  Logger.log('Trigger diario instalado (18:00-19:00, zona ' + ZONA + ').');
}

/**
 * Revisa cada reto y notifica a quien está en riesgo de multa:
 * le faltan días y los días que restan de la semana apenas alcanzan.
 */
function enviarRecordatorios() {
  var hoy = new Date();
  var dia = Number(Utilities.formatDate(hoy, ZONA, 'u')); // 1=lun … 7=dom
  var quedanInclHoy = 8 - dia;

  Object.keys(PUSH_RETOS).forEach(function (retoId) {
    var meta = PUSH_RETOS[retoId].meta;
    var usuarios = usuariosConToken_(retoId);
    if (!usuarios.length) return;

    var dias = diasCumplidosSemana_(retoId);
    usuarios.forEach(function (u) {
      var hechos = dias[u.id] || 0;
      var faltan = meta - hechos;
      if (faltan <= 0 || quedanInclHoy > faltan + 1) return; // va bien o aún sobra margen
      var critico = quedanInclHoy <= faltan;
      var titulo = critico ? '🚨 ¡La multa te alcanza!' : '⚠️ No te duermas';
      var cuerpo = 'Llevas ' + hechos + '/' + meta + ' esta semana. Te falta' + (faltan !== 1 ? 'n' : '')
        + ' ' + faltan + ' día' + (faltan !== 1 ? 's' : '') + ' y queda' + (quedanInclHoy !== 1 ? 'n' : '')
        + ' ' + quedanInclHoy + '. ¡Al gym, ' + u.nombre.split(' ')[0] + '!';
      enviarFCM_(retoId, u, titulo, cuerpo);
    });
  });
}

/** Notificación de prueba a todos los tokens registrados. */
function probarPush() {
  Object.keys(PUSH_RETOS).forEach(function (retoId) {
    usuariosConToken_(retoId).forEach(function (u) {
      enviarFCM_(retoId, u, '💪 RETO GYM 2026', 'Notificaciones activadas correctamente, ' + u.nombre.split(' ')[0] + '.');
    });
  });
}

// ————————————————————————————————— Firestore (lectura)

function runQuery_(retoId, structuredQuery) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT
    + '/databases/(default)/documents/retos/' + retoId + ':runQuery';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + idToken_() },
    payload: JSON.stringify({ structuredQuery: structuredQuery }),
  });
  if (res.getResponseCode() >= 400) throw new Error('runQuery ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText())
    .filter(function (r) { return r.document; })
    .map(function (r) {
      var f = r.document.fields || {};
      var doc = { _id: r.document.name.split('/').pop() };
      Object.keys(f).forEach(function (k) {
        var v = f[k];
        doc[k] = v.stringValue !== undefined ? v.stringValue
          : v.integerValue !== undefined ? Number(v.integerValue)
          : v.doubleValue !== undefined ? v.doubleValue
          : v.booleanValue !== undefined ? v.booleanValue : null;
      });
      return doc;
    });
}

function usuariosConToken_(retoId) {
  return runQuery_(retoId, {
    from: [{ collectionId: 'usuarios' }],
    where: { fieldFilter: { field: { fieldPath: 'estado' }, op: 'EQUAL', value: { stringValue: 'Activo' } } },
  })
    .filter(function (u) { return u.fcmToken; })
    .map(function (u) { return { id: u._id, nombre: u.nombre || u._id, fcmToken: u.fcmToken }; });
}

/** Días únicos CUMPLE/JUSTIFICADO por usuario en la semana actual (lun-dom). */
function diasCumplidosSemana_(retoId) {
  var hoy = new Date();
  var dia = Number(Utilities.formatDate(hoy, ZONA, 'u'));
  var lunes = new Date(hoy); lunes.setDate(hoy.getDate() - (dia - 1));
  var domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  var f = function (d) { return Utilities.formatDate(d, ZONA, 'yyyy-MM-dd'); };

  var registros = runQuery_(retoId, {
    from: [{ collectionId: 'registros' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'fecha' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: f(lunes) } } },
      { fieldFilter: { field: { fieldPath: 'fecha' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: f(domingo) } } },
    ] } },
  });

  var porUsuario = {};
  registros.forEach(function (r) {
    if (r.estatus !== 'CUMPLE' && r.estatus !== 'JUSTIFICADO') return;
    porUsuario[r.usuarioId] = porUsuario[r.usuarioId] || {};
    porUsuario[r.usuarioId][r.fecha] = true;
  });
  var dias = {};
  Object.keys(porUsuario).forEach(function (u) { dias[u] = Object.keys(porUsuario[u]).length; });
  return dias;
}

// ————————————————————————————————— FCM (envío)

function enviarFCM_(retoId, usuario, titulo, cuerpo) {
  var url = 'https://fcm.googleapis.com/v1/projects/' + FB_PROJECT + '/messages:send';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({
      message: {
        token: usuario.fcmToken,
        notification: { title: titulo, body: cuerpo },
        webpush: {
          notification: { icon: PUSH_ICONO, badge: PUSH_ICONO },
          fcmOptions: { link: PUSH_APP_URL },
        },
      },
    }),
  });
  var code = res.getResponseCode();
  if (code === 404 || res.getContentText().indexOf('UNREGISTERED') !== -1) {
    limpiarToken_(retoId, usuario.id); // token caducado: se limpia para no reintentar
  } else if (code >= 400) {
    Logger.log('FCM ' + usuario.id + ' → ' + code + ': ' + res.getContentText().slice(0, 200));
  }
}

/** Quita un fcmToken caducado del participante (usa el token admin del espejo). */
function limpiarToken_(retoId, usuarioId) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT
    + '/databases/(default)/documents/retos/' + retoId + '/usuarios/' + usuarioId
    + '?updateMask.fieldPaths=fcmToken';
  UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + idToken_() },
    payload: JSON.stringify({ fields: {} }),
  });
}
