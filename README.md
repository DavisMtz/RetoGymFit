# RETO GYM 2026 💪⚡

App del reto del gym (versión **Mixto** y **Damas**) construida con **React + Vite + Firebase**, evolución de la app original de Google Apps Script. Google Sheets **sigue recibiendo cada registro** a través de un puente de Apps Script.

## Pantallas

| Pantalla | Qué hace |
|---|---|
| **Onboarding** | Eliges tu reto, buscas tu nombre entre los participantes activos y — la primera vez — creas tu contraseña. Después solo la ingresas. La sesión queda guardada en el dispositivo. |
| **Hoy** | Registro del día: actividad, tiempo, calorías, código de honor. Calcula CUMPLE / NO CUMPLE / JUSTIFICADO con las reglas de tu reto, muestra tu racha, tu semana visual y la zona de peligro de multa. |
| **Historial** | Bitácora completa agrupada por semana con estatus de cada día. |
| **Ranking** | Clasificación semanal y mensual, bote acumulado y ticker de actividad reciente. |
| **Stats** | Días totales, rachas, kcal y horas acumuladas, cumplimiento de las últimas 8 semanas y distribución por actividad. |
| **Perfil** | Tus datos, días de vacaciones/periodo disponibles, cambio de contraseña y cierre de sesión. |

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
4. Project settings → Your apps → Web app → copia la config.

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
firebase deploy --only firestore
```

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

Cada registro guardado en Firestore se replica a la pestaña `Registros` con las mismas columnas de siempre. Si el teléfono está sin señal, queda en una cola local y se reenvía al abrir la app. **Firestore es la fuente de verdad**; la hoja es la réplica.

### 6. Publicar
```bash
npm run build
firebase deploy --only hosting
```

## Registrar pagos (bote)

Los pagos se capturan en Firestore (`retos/{retoId}/pagos`) desde la consola de Firebase — campos: `fecha` ("2026-03-01"), `usuario`, `monto` (número), `notas`. Puedes seguir usando tu sidebar de Apps Script para la hoja y duplicar el alta en Firestore, o capturarlos solo en Firestore.

## Stack

- **React 18 + Vite** · SPA con `HashRouter` (funciona en cualquier hosting estático)
- **Firebase Auth** (anónimo + email/password sintético) · **Firestore** con caché offline persistente
- **canvas-confetti** para las celebraciones 🎉
- Diseño propio (dark + lima eléctrico, tipografías Bricolage Grotesque / Geist / Instrument Serif) heredado de la app original y ampliado: intro cinemática de bienvenida, tab bar flotante con blur, reveals escalonados y tema rosa para Damas.
