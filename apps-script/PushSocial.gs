/**
 * NOTIFICACIONES SOCIALES — RETO GYM 2026
 *
 * Cada ~5 minutos revisa qué pasó en la app y avisa por push (FCM):
 *   • Publicación nueva en el feed  → a todo el equipo (menos el autor)
 *   • Registro de actividad nuevo   → a todo el equipo (menos el autor)
 *   • Reacción a TU publicación     → solo a ti
 *   • Comentario en TU publicación  → solo a ti
 *
 * Vive en el MISMO proyecto de Apps Script que SheetsBridge.gs y
 * PushReminders.gs (reutiliza FB_PROJECT, ZONA, idToken_ y runQuery_).
 *
 * INSTALACIÓN: con PushReminders.gs ya configurado (manifiesto con el
 * scope firebase.messaging), solo pega este archivo y ejecuta una vez
 * instalarTriggerSocial. Listo.
 */

/** Instala el trigger de cada 5 minutos. */
function instalarTriggerSocial() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarNotificacionesSociales') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarNotificacionesSociales').timeBased().everyMinutes(5).create();
  // Marca "ahora" como punto de partida para no notificar lo histórico
  PropertiesService.getScriptProperties().setProperty('social_desde', new Date().toISOString());
  Logger.log('Trigger social instalado (cada 5 min).');
}

function enviarNotificacionesSociales() {
  var props = PropertiesService.getScriptProperties();
  var desde = props.getProperty('social_desde') || new Date(Date.now() - 10 * 60000).toISOString();
  var ahora = new Date().toISOString();

  Object.keys(PUSH_RETOS).forEach(function (retoId) {
    var usuarios = usuariosConToken_(retoId); // [{ id, nombre, fcmToken }]
    if (!usuarios.length) { limpiarEventos_(retoId); return; }
    var tokenPorAuthUid = mapaAuthUid_(retoId, usuarios);

    // 1) Publicaciones nuevas en el feed
    consultarDesde_(retoId, 'posts', desde).forEach(function (p) {
      var cuerpo = p.texto ? recortar_(p.texto, 90) : '📸 Subió una foto — échale un ojo.';
      difundir_(usuarios, p.authUid, '📣 ' + primerNombre_(p.nombre) + ' publicó en el feed', cuerpo, retoId);
    });

    // 2) Registros de actividad nuevos
    consultarDesde_(retoId, 'registros', desde).forEach(function (r) {
      if (r.estatus !== 'CUMPLE' && r.estatus !== 'JUSTIFICADO') return;
      var authUid = null; // los registros no guardan authUid; excluye por usuarioId
      var cuerpo = r.tipo + (Number(r.calorias) > 0 ? ' · ' + r.calorias + ' kcal' : '') + ' — ¡síguele el paso!';
      usuarios.forEach(function (u) {
        if (u.id === r.usuarioId) return;
        enviarFCM_(retoId, u, '🏋️ ' + primerNombre_(r.nombre) + ' ya entrenó hoy', cuerpo);
      });
      void authUid;
    });

    // 3) Reacciones y comentarios dirigidos (colección eventos)
    var eventos = runQuery_(retoId, { from: [{ collectionId: 'eventos' }] });
    eventos.forEach(function (e) {
      var destino = tokenPorAuthUid[e.paraAuthUid];
      if (destino) {
        if (e.tipo === 'reaccion') {
          enviarFCM_(retoId, destino, e.detalle + ' A ' + primerNombre_(e.deNombre) + ' le gustó tu publicación',
            e.postTexto ? '“' + recortar_(e.postTexto, 70) + '”' : 'Abre el feed para verlo.');
        } else if (e.tipo === 'comentario') {
          enviarFCM_(retoId, destino, '💬 ' + primerNombre_(e.deNombre) + ' comentó tu publicación',
            recortar_(e.detalle, 90));
        }
      }
      borrarDoc_('retos/' + retoId + '/eventos/' + e._id);
    });
  });

  props.setProperty('social_desde', ahora);
}

// ————————————————————————————————— Helpers

function primerNombre_(n) { return String(n || 'Alguien').split(' ')[0]; }
function recortar_(t, max) { t = String(t || ''); return t.length > max ? t.slice(0, max - 1) + '…' : t; }

function difundir_(usuarios, autorAuthUid, titulo, cuerpo, retoId) {
  var mapa = mapaAuthUid_(retoId, usuarios);
  var autor = null;
  Object.keys(mapa).forEach(function (uid) { if (uid === autorAuthUid) autor = mapa[uid]; });
  usuarios.forEach(function (u) {
    if (autor && u.id === autor.id) return;
    enviarFCM_(retoId, u, titulo, cuerpo);
  });
}

// authUid → usuario (para dirigir eventos y excluir autores)
var _mapaCache = {};
function mapaAuthUid_(retoId, usuariosConTok) {
  if (_mapaCache[retoId]) return _mapaCache[retoId];
  var todos = runQuery_(retoId, {
    from: [{ collectionId: 'usuarios' }],
  });
  var porAuthUid = {};
  var tokenPorId = {};
  usuariosConTok.forEach(function (u) { tokenPorId[u.id] = u; });
  todos.forEach(function (u) {
    if (u.authUid && tokenPorId[u._id]) porAuthUid[u.authUid] = tokenPorId[u._id];
  });
  _mapaCache[retoId] = porAuthUid;
  return porAuthUid;
}

/** Documentos de una colección con creadoEn > desde (ISO). */
function consultarDesde_(retoId, coleccion, desdeISO) {
  return runQuery_(retoId, {
    from: [{ collectionId: coleccion }],
    where: { fieldFilter: { field: { fieldPath: 'creadoEn' }, op: 'GREATER_THAN', value: { timestampValue: desdeISO } } },
    orderBy: [{ field: { fieldPath: 'creadoEn' }, direction: 'ASCENDING' }],
    limit: 40,
  });
}

function borrarDoc_(ruta) {
  UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + FB_PROJECT + '/databases/(default)/documents/' + ruta, {
    method: 'delete', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + idToken_() },
  });
}

function limpiarEventos_(retoId) {
  runQuery_(retoId, { from: [{ collectionId: 'eventos' }], limit: 50 }).forEach(function (e) {
    borrarDoc_('retos/' + retoId + '/eventos/' + e._id);
  });
}
