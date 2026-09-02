-- Correos de recuperación — Cloudflare D1 (base `retogymfit`).
--
-- Viven aquí y no en Firestore por dos razones:
--   1. En Firestore, usuarios/{id} lo puede leer CUALQUIER cuenta autenticada
--      (incluso anónima), así que un correo ahí quedaría a la vista de todo
--      el reto. En D1 solo lo lee el Worker: no hay reglas que equivocar.
--   2. El proyecto se está moviendo de Firebase a Cloudflare.
--
-- El padrón (quién participa, si está Activo) sigue en Firestore por ahora,
-- así que aquí no duplicamos el nombre: sería una segunda fuente de verdad.
-- Guardamos el authUid para poder comprobar que quien actualiza el correo es
-- el mismo dueño que lo registró.

DROP TABLE IF EXISTS correos;

CREATE TABLE correos (
  reto_id        TEXT NOT NULL,
  usuario_id     TEXT NOT NULL,
  email          TEXT NOT NULL,
  auth_uid       TEXT NOT NULL,     -- uid de Firebase Auth al registrarlo
  actualizado_en INTEGER NOT NULL,  -- epoch ms
  PRIMARY KEY (reto_id, usuario_id)
);
