/**
 * PUENTE GOOGLE SHEETS ⇄ FIREBASE — RETO GYM 2026
 *
 * Google Sheets es tu base de datos fácil de administrar; Firebase (Firestore)
 * es el ESPEJO que hace la app fluida. Este único script:
 *
 *   1. Recibe registros de la app (doPost) y los agrega a la hoja del reto.
 *   2. Sirve la lista de participantes a la app (doGet ?accion=usuarios).
 *   3. ESPEJA las hojas → Firestore: participantes, registros y pagos.
 *      - Importación inicial + resincronización manual: sincronizarTodo()
 *      - Automático al editar una hoja: trigger onEditEspejo
 *      - Red de seguridad: trigger cada 15 min
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ INSTALACIÓN (una sola vez)                                        │
 * │  1. Pega TODO este archivo en tu proyecto de script.google.com   │
 * │     (reemplaza lo anterior) y guarda.                            │
 * │  2. Vuelve a implementar el Web App:                             │
 * │       Implementar → Administrar implementaciones → ✏️ →          │
 * │       Versión: Nueva versión → Implementar                       │
 * │     (así la URL del webhook NO cambia)                           │
 * │  3. Selecciona la función  configurarEspejo  arriba y pulsa      │
 * │     ▶ Ejecutar. Autoriza los permisos que pida.                 │
 * │     Eso IMPORTA todo a Firebase e instala los triggers.         │
 * │  Listo. A partir de ahí, cada cambio en las hojas se espeja solo.│
 * └─────────────────────────────────────────────────────────────────┘
 */

// ————————————————————————————————— CONFIGURACIÓN

var TOKEN = '7ddf4b0e8c45ea15ca556a993ccd1074';

var HOJAS = {
  mixto: '1E46f6q3q1kLl4E04uX1i3a0HENZpmcOVatDtbd0E8TQ',
  damas: '1JXd0uyYTzNNgdHuiY-Ndk3Mt5pt_TM5BvswbMGI1zpo',
};

// Proyecto Firebase + cuenta de servicio del espejo (solo esta cuenta puede
// escribir todo Firestore, según las reglas de seguridad).
var FB_PROJECT = 'retogymfit';
var FB_API_KEY = 'AIzaSyDQwFU9hcM1iJbRJW5zArdhvlV-vqaRIQE';
var FB_ADMIN_EMAIL = 'admin-sync@retogymfit.app';
var FB_ADMIN_PASSWORD = '101a4e3752111386060a1224a5699eb06f63100a';

var ZONA = 'America/Mexico_City';

// ════════════════════════════════════════════════════════════════
//  ENDPOINTS HTTP (app ⇄ script)
// ════════════════════════════════════════════════════════════════

function doPost(e) {
  var out = { success: false };
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) { out.message = 'Token inválido'; return responder(out); }

    if (body.accion === 'registro') {
      var sheetId = HOJAS[body.retoId];
      if (!sheetId) throw new Error('Reto desconocido: ' + body.retoId);
      var r = body.registro;
      var hoja = SpreadsheetApp.openById(sheetId).getSheetByName('Registros');
      if (!hoja) throw new Error("No existe la pestaña 'Registros' en " + body.retoId);

      // Evitar duplicados si la app reintenta
      var datos = hoja.getDataRange().getValues();
      for (var i = 1; i < datos.length; i++) {
        var fechaStr = datos[i][2] instanceof Date
          ? Utilities.formatDate(datos[i][2], ZONA, 'yyyy-MM-dd') : String(datos[i][2]);
        if (datos[i][1] === r.nombre && fechaStr === r.fecha) {
          out.success = true; out.message = 'Duplicado ignorado'; return responder(out);
        }
      }
      var p = r.fecha.split('-');
      var fechaGuardar = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
      hoja.appendRow([new Date(), r.nombre, fechaGuardar, r.tipo,
        Number(r.minutos) || 0, Number(r.calorias) || 0, r.evidencia || '', r.estatus, r.notas || '']);
      out.success = true;
    } else {
      out.message = 'Acción desconocida';
    }
  } catch (err) { out.message = String(err); }
  return responder(out);
}

function doGet(e) {
  var out = { success: false };
  try {
    var p = (e && e.parameter) || {};
    if (p.token !== TOKEN) { out.message = 'Token inválido'; return responder(out); }
    if (p.accion === 'usuarios') {
      var res = {};
      for (var reto in HOJAS) {
        var hoja = SpreadsheetApp.openById(HOJAS[reto]).getSheetByName('Usuarios');
        var lista = [];
        if (hoja && hoja.getLastRow() > 1) {
          var datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
          for (var i = 0; i < datos.length; i++) {
            if (datos[i][0]) lista.push({ nombre: String(datos[i][0]).trim(), estado: String(datos[i][1] || '').trim() });
          }
        }
        res[reto] = lista;
      }
      out = { success: true, usuarios: res };
    } else if (p.accion === 'sincronizar') {
      // Fuerza un espejo completo Sheets → Firestore bajo demanda.
      out = { success: true, resumen: sincronizarTodo() };
    } else { out.message = 'Acción desconocida'; }
  } catch (err) { out.message = String(err); }
  return responder(out);
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN DEL ESPEJO (ejecutar UNA vez)
// ════════════════════════════════════════════════════════════════

function configurarEspejo() {
  // 1) Importar/espejar todo ahora
  var resumen = sincronizarTodo();
  // 2) Instalar triggers (borra los previos para no duplicar)
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  for (var reto in HOJAS) {
    ScriptApp.newTrigger('onEditEspejo').forSpreadsheet(HOJAS[reto]).onEdit().create();
  }
  ScriptApp.newTrigger('sincronizarTodo').timeBased().everyMinutes(15).create();
  Logger.log('✅ Espejo configurado. ' + resumen);
  Logger.log('Triggers: onEdit en ambas hojas + resync cada 15 min.');
  return resumen;
}

// Se dispara al editar cualquiera de las hojas → espeja ese reto
function onEditEspejo(e) {
  try {
    var id = e && e.source ? e.source.getId() : null;
    for (var reto in HOJAS) {
      if (HOJAS[reto] === id) { sincronizarReto_(reto); return; }
    }
  } catch (err) { Logger.log('onEditEspejo error: ' + err); }
}

// ════════════════════════════════════════════════════════════════
//  MOTOR DE SINCRONIZACIÓN Sheets → Firestore
// ════════════════════════════════════════════════════════════════

function sincronizarTodo() {
  var partes = [];
  for (var reto in HOJAS) partes.push(sincronizarReto_(reto));
  var resumen = partes.join(' · ');
  Logger.log(resumen);
  return resumen;
}

function sincronizarReto_(reto) {
  var ss = SpreadsheetApp.openById(HOJAS[reto]);
  var writes = [];

  // — Usuarios (Col A: Nombre, B: Estado). updateMask preserva authUid/hasPassword.
  var hu = ss.getSheetByName('Usuarios');
  var nU = 0;
  if (hu && hu.getLastRow() > 1) {
    var du = hu.getRange(2, 1, hu.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < du.length; i++) {
      var nombre = String(du[i][0] || '').trim();
      if (!nombre) continue;
      var estado = String(du[i][1] || '').trim() === 'Activo' ? 'Activo' : 'Inactivo';
      writes.push({
        update: {
          name: docName_(reto, 'usuarios', slug_(nombre)),
          fields: { nombre: sv_(nombre), estado: sv_(estado) },
        },
        updateMask: { fieldPaths: ['nombre', 'estado'] },
      });
      nU++;
    }
  }

  // — Registros (A:Timestamp B:Usuario C:Fecha D:Tipo E:Min F:Kcal G:Evid H:Estatus I:Notas)
  var hr = ss.getSheetByName('Registros');
  var nR = 0;
  if (hr && hr.getLastRow() > 1) {
    var dr = hr.getRange(2, 1, hr.getLastRow() - 1, 9).getValues();
    for (var j = 0; j < dr.length; j++) {
      var usuario = String(dr[j][1] || '').trim();
      if (!usuario || !dr[j][2]) continue;
      var fecha = ymd_(dr[j][2]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      var uid = slug_(usuario);
      var creado = dr[j][0] instanceof Date ? dr[j][0] : new Date();
      writes.push({
        update: {
          name: docName_(reto, 'registros', uid + '_' + fecha),
          fields: {
            usuarioId: sv_(uid), nombre: sv_(usuario), fecha: sv_(fecha),
            semanaIso: iv_(semanaIso_(fecha)), anioIso: iv_(anioIso_(fecha)), mes: sv_(fecha.slice(0, 7)),
            tipo: sv_(String(dr[j][3] || '')),
            minutos: iv_(Number(dr[j][4]) || 0), calorias: iv_(Number(dr[j][5]) || 0),
            evidencia: sv_(String(dr[j][6] || '')), estatus: sv_(String(dr[j][7] || 'N/A')),
            notas: sv_(String(dr[j][8] || '')),
            creadoEn: tv_(creado.toISOString()), origenHoja: bv_(true),
          },
        },
      });
      nR++;
    }
  }

  // — Pagos (A:Fecha B:Usuario C:Monto D:Notas). id por fila = idempotente.
  var hp = ss.getSheetByName('Pagos');
  var nP = 0;
  if (hp && hp.getLastRow() > 1) {
    var dp = hp.getRange(2, 1, hp.getLastRow() - 1, 4).getValues();
    for (var k = 0; k < dp.length; k++) {
      var monto = parseFloat(dp[k][2]);
      if (isNaN(monto)) continue;
      writes.push({
        update: {
          name: docName_(reto, 'pagos', 'fila' + (k + 2)),
          fields: {
            fecha: sv_(dp[k][0] ? ymd_(dp[k][0]) : ''), usuario: sv_(String(dp[k][1] || '')),
            monto: dv_(monto), notas: sv_(String(dp[k][3] || '')),
          },
        },
      });
      nP++;
    }
  }

  batchWrite_(writes);
  return reto + ': ' + nU + ' usuarios, ' + nR + ' registros, ' + nP + ' pagos';
}

// ════════════════════════════════════════════════════════════════
//  FIRESTORE REST
// ════════════════════════════════════════════════════════════════

// Escribe en lotes con :commit (respeta las reglas con el token admin;
// :batchWrite las ignora y sería rechazado).
function batchWrite_(writes) {
  if (!writes.length) return;
  var token = idToken_();
  var url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT + '/databases/(default)/documents:commit';
  for (var i = 0; i < writes.length; i += 100) {
    var chunk = writes.slice(i, i + 100);
    var res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ writes: chunk }), muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 400) throw new Error('commit ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
}

// ID token de la cuenta admin, cacheado ~50 min
function idToken_() {
  var cache = PropertiesService.getScriptProperties();
  var tok = cache.getProperty('fb_tok');
  var exp = Number(cache.getProperty('fb_tok_exp') || 0);
  if (tok && Date.now() < exp) return tok;
  var res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FB_API_KEY,
    { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ email: FB_ADMIN_EMAIL, password: FB_ADMIN_PASSWORD, returnSecureToken: true }) });
  var j = JSON.parse(res.getContentText());
  if (!j.idToken) throw new Error('Login admin falló: ' + res.getContentText().slice(0, 200));
  cache.setProperty('fb_tok', j.idToken);
  cache.setProperty('fb_tok_exp', String(Date.now() + 50 * 60 * 1000));
  return j.idToken;
}

function docName_(reto, col, id) {
  return 'projects/' + FB_PROJECT + '/databases/(default)/documents/retos/' + reto + '/' + col + '/' + id;
}

// — helpers de valores Firestore
function sv_(s) { return { stringValue: String(s) }; }
function iv_(n) { return { integerValue: String(Math.round(Number(n) || 0)) }; }
function dv_(n) { return { doubleValue: Number(n) || 0 }; }
function bv_(b) { return { booleanValue: !!b }; }
function tv_(iso) { return { timestampValue: iso }; }

// — fecha / semana ISO (idénticas al cliente)
function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'yyyy-MM-dd');
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, ZONA, 'yyyy-MM-dd');
}
function semanaIso_(ymd) {
  var p = ymd.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - ys) / 86400000) + 1) / 7);
}
function anioIso_(ymd) {
  var p = ymd.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}
function slug_(nombre) {
  return String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Prueba rápida de acceso a las hojas (Ejecutar → probarConexion) */
function probarConexion() {
  for (var reto in HOJAS) {
    var ss = SpreadsheetApp.openById(HOJAS[reto]);
    Logger.log(reto + ': ' + ss.getName() + ' → Registros ' +
      (ss.getSheetByName('Registros') ? 'OK' : 'FALTA') + ', Usuarios ' +
      (ss.getSheetByName('Usuarios') ? 'OK' : 'FALTA'));
  }
}
