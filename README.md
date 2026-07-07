# RETO GYM 2026 💪⚡

App del reto del gym (versión **Mixto** y **Damas**) construida con **React + Vite + Firebase**, evolución de la app original de Google Apps Script. Google Sheets **sigue recibiendo cada registro** a través de un puente de Apps Script.

## Pantallas

| Pantalla | Qué hace |
|---|---|
| **Onboarding** | Eliges tu reto, buscas tu nombre entre los participantes activos y — la primera vez — creas tu contraseña. Después solo la ingresas. La sesión queda guardada en el dispositivo. |
| **Hoy** | Registro del día: actividad, tiempo, calorías, código de honor. Calcula CUMPLE / NO CUMPLE / JUSTIFICADO con las reglas de tu reto, muestra tu racha, tu semana visual, la zona de peligro de multa y la barra "el equipo hoy" (quiénes ya entrenaron). Al guardar: pantalla de celebración con tu racha y **autopost al feed** con tu actividad y tu nota. |
| **Historial** | Bitácora completa agrupada por semana con estatus de cada día. |
| **Ranking** | Clasificación semanal y mensual (se reordena animada con FLIP), bote acumulado, ticker de actividad reciente, anillo de progreso semanal en cada avatar y botón 🖐️ para chocar los cinco (le llega por push). |
| **Stats** | Días totales, rachas, kcal y horas acumuladas (con contadores animados), cumplimiento de las últimas 8 semanas y distribución por actividad. |
| **Perfil** | Tus datos con anillo de progreso semanal, días de vacaciones/periodo disponibles, tema claro/oscuro, cambio de contraseña y cierre de sesión. |

Extras sociales: reacciones con partículas de emoji, **@menciones en comentarios** con autocomplete y push al mencionado, y pull-to-refresh en Feed y Ranking. El autopost de registro **nunca publica el Periodo Menstrual** (misma política de privacidad que el ticker y las notificaciones).

Las diferencias entre retos (meta 4 vs 3 días, reglas de cumplimiento, actividad "Periodo Menstrual", límites 13 días de vacaciones / 2 días de periodo al mes) viven en `src/config/retos.js`.

## Estructura de Firestore

```
retos/{retoId}                        # 'mixto' | 'damas'
├── usuarios/{usuarioId}              # slug del nombre, p.ej. 'alexa-bautista'
│     nombre: "Alexa Bautista"
│     estado: "Activo" | "Inactivo"
│     authUid: null | "<uid>"         # se llena al crear contraseña
│     hasPassword: bool
│     ultimoAcceso: timestamp
│     fotoPerfil?: string             # URL de descarga del avatar en Storage (avatares/{authUid}/perfil.jpg)
│
├── registros/{usuarioId}_{fecha}     # id determinista ⇒ 1 registro/día
│     usuarioId, nombre
│     fecha: "2026-03-14"             # día MX
│     semanaIso: 11, anioIso: 2026, mes: "2026-03"
│     tipo: "Gimnasio" | "Fuera del Gym" | "Vacaciones" | "Incapacidad" | "Periodo Menstrual"
│     minutos: number, calorias: number
│     evidencia: "SÍ" | "NO" | "N/A"
│     estatus: "CUMPLE" | "NO CUMPLE" | "JUSTIFICADO" | "N/A"
│     notas: string, creadoEn: timestamp
│
└── pagos/{pagoId}                    # el bote (solo escribe el admin)
      fecha, usuario, monto, notas
```

**Cómo se garantiza la integridad** (ver `firestore.rules`):
- El id `{usuarioId}_{fecha}` + regla *create-only* hace **imposible el doble registro** del día y la edición posterior.
- Un registro solo puede crearlo el dueño del perfil (`usuarios/{id}.authUid == auth.uid`).
- Un perfil se "reclama" una sola vez: `authUid` pasa de `null` al uid de quien crea la contraseña; después solo su dueño lo modifica.
- Pagos y altas/bajas de participantes: solo desde la consola de Firebase (o Admin SDK).

## Autenticación

- Al abrir la app se usa **sesión anónima** de Firebase solo para leer la lista de nombres del onboarding.
- Cada participante se mapea a una cuenta de email sintético `u-{usuarioId}@{retoId}.retogymfit.app` + su contraseña. La primera vez, la cuenta anónima se convierte (link) en esa cuenta.
- La sesión persiste en el dispositivo; `localStorage` guarda `{ retoId, usuarioId }`.
- **¿Alguien olvidó su contraseña?** Como admin: Firebase Console → Authentication → busca su correo sintético → borra la cuenta, y en Firestore pon `authUid: null, hasPassword: false` en su documento. La próxima vez que entre creará contraseña nueva.

## Puesta en marcha

### 1. Crear el proyecto Firebase
1. [Firebase Console](https://console.firebase.google.com) → nuevo proyecto.
2. **Authentication** → Sign-in method → habilita **Anonymous** y **Email/Password**.
3. **Firestore Database** → crear (production mode).
4. **Storage** → *Get started* (guarda las fotos de perfil). En proyectos creados desde finales de 2024 Storage exige el plan **Blaze** (pago por uso); un avatar pesa ~30–150 KB, el consumo es mínimo.
5. Project settings → Your apps → Web app → copia la config.

### 2. Configurar y correr la app
```bash
cp .env.example .env      # y llena los VITE_FIREBASE_*
npm install
npm run dev
```

### 3. Reglas e índices
```bash
npm install -g firebase-tools
firebase login && firebase use <tu-proyecto>
firebase deploy --only firestore,storage
```
Esto sube las reglas de Firestore (`firestore.rules`), los índices y las reglas de Storage (`storage.rules`) que autorizan a cada quien a subir su propio avatar.

### 4. Migrar los datos de tus hojas
Exporta a CSV las pestañas **Usuarios**, **Registros** y **Pagos** de cada hoja, descarga una clave de servicio (Project settings → Service accounts) como `serviceAccount.json` y:
```bash
npm install firebase-admin --no-save
node scripts/migrar.mjs --reto mixto --usuarios usuarios.csv --registros registros.csv --pagos pagos.csv
node scripts/migrar.mjs --reto damas --usuarios usuarias.csv --registros registros_d.csv --pagos pagos_d.csv
```

### 5. Conectar Google Sheets (para que la hoja siga viva)
1. En cada Google Sheet: Extensiones → Apps Script → pega `apps-script/SheetsBridge.gs`.
2. Cambia el `TOKEN` por un secreto tuyo.
3. Implementar → Aplicación web → *Ejecutar como: tú* / *Acceso: cualquier persona* → copia la URL.
4. En `.env`: `VITE_SHEETS_WEBHOOK_MIXTO`, `VITE_SHEETS_WEBHOOK_DAMAS` y `VITE_SHEETS_WEBHOOK_TOKEN`.

Cada registro guardado en la app se replica a la pestaña `Registros` con las mismas columnas de siempre. Si el teléfono está sin señal, queda en una cola local y se reenvía al abrir la app.

### Espejo Google Sheets → Firebase (bidireccional)

**Google Sheets es la interfaz de administración** (editas participantes, corriges registros, capturas pagos a mano) y **Firebase es el espejo veloz** que hace la app fluida. El mismo `SheetsBridge.gs` mantiene el espejo:

- `configurarEspejo()` — ejecútala una vez desde el editor de Apps Script: importa todo (usuarios, registros, pagos) a Firestore e instala los triggers.
- **Trigger onEdit** en ambas hojas → cada cambio manual se espeja al instante.
- **Trigger cada 15 min** → red de seguridad que reconcilia todo.

Escribe en Firestore con la cuenta de servicio `admin-sync@retogymfit.app` (el único uid con permiso de escritura total según `firestore.rules`). El sync de usuarios usa `updateMask` para no pisar `authUid`/`hasPassword` que fija la app al reclamar perfil.

Flujo de datos:
- **App → Firestore** (instantáneo, para fluidez) **y → Sheets** (webhook).
- **Sheets → Firestore** (espejo onEdit + cada 15 min).
- **Panel admin → Sheets**: al editar un registro desde el panel se **actualiza
  la fila** correspondiente de la hoja (upsert), y al borrarlo se **elimina la
  fila** — así no hay que capturar dos veces ni el espejo de 15 min revive
  registros borrados. (Requiere volver a implementar el Web App con la versión
  actual de `SheetsBridge.gs`: Implementar → Administrar implementaciones →
  ✏️ → Nueva versión.)

El panel admin también **modera el feed social**: puede editar el texto o
eliminar publicaciones de cualquier participante (con sus comentarios y
reacciones) y borrar comentarios individuales.

### 6. Publicar
```bash
npm run build
firebase deploy --only hosting
```

## Notificaciones push (recordatorios de multa)

La app es una **PWA instalable** (manifest + service worker `public/sw.js`). Las
notificaciones usan **Firebase Cloud Messaging** y requieren dos pasos de
configuración únicos:

1. **Llave VAPID** (pública, no secreta): Firebase Console → ⚙ Project settings →
   Cloud Messaging → *Web Push certificates* → **Generate key pair**. Pégala en
   `src/config/push.js` (o en `.env` como `VITE_FCM_VAPID_KEY`) y vuelve a
   desplegar hosting. Con la llave presente, cada participante puede activar
   las notificaciones desde **Perfil → Notificaciones push** (en Android/desktop
   directo; en iPhone primero deben *instalar* la app: Compartir → Agregar a
   pantalla de inicio).
2. **Emisor de recordatorios**: pega `apps-script/PushReminders.gs` en el mismo
   proyecto de Apps Script del puente y sigue las instrucciones del encabezado
   (manifest con el scope `firebase.messaging` + ejecutar `instalarTriggerPush`).
   Cada día ~18:00 revisa quién va atrasado en la semana y le manda un
   recordatorio antes de que multe. `probarPush` envía una notificación de
   prueba a todos los tokens registrados.
3. **Notificaciones sociales**: pega también `apps-script/PushSocial.gs` y
   ejecuta una vez `instalarTriggerSocial`. Cada ~5 minutos avisa por push:
   publicaciones nuevas del feed y registros de actividad (a todo el equipo),
   y reacciones/comentarios a tu publicación (solo a ti).

## Registrar pagos (bote)

Los pagos se capturan en Firestore (`retos/{retoId}/pagos`) desde la consola de Firebase — campos: `fecha` ("2026-03-01"), `usuario`, `monto` (número), `notas`. Puedes seguir usando tu sidebar de Apps Script para la hoja y duplicar el alta en Firestore, o capturarlos solo en Firestore.

## Stack

- **React 18 + Vite** · SPA con `HashRouter` (funciona en cualquier hosting estático)
- **Firebase Auth** (anónimo + email/password sintético) · **Firestore** con caché offline persistente
- **canvas-confetti** para las celebraciones 🎉
- Diseño propio (dark + lima eléctrico, tipografías Bricolage Grotesque / Geist / Instrument Serif) heredado de la app original y ampliado: intro cinemática de bienvenida, tab bar flotante con blur, reveals escalonados y tema rosa para Damas.
