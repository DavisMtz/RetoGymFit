# retogymfit-auth

Recuperación de contraseña por código al correo. Sustituye al "pídele al
administrador que te restablezca el acceso" por un flujo que el propio
participante completa en 2 minutos.

## Por qué existe

Los participantes no tienen correo en Firebase Auth: cada uno se mapea a un
email sintético `u-{usuarioId}[-r{gen}]@{retoId}.retogymfit.app`, un dominio
que no existe como buzón. El correo de restablecimiento que manda Firebase no
tiene a dónde llegar, así que hay que traer un correo real por fuera.

## Cómo funciona

```
Perfil → "Correo de recuperación"
   └─ el cliente escribe retos/{retoId}/correos/{usuarioId}
      (firestore.rules exige que el perfil ya sea suyo)

Onboarding → "¿Olvidaste tu contraseña?"
   ├─ POST /recuperar/solicitar  {retoId, usuarioId}
   │    · lee el correo registrado con la identidad del Worker
   │    · genera un código de 6 dígitos (crypto.getRandomValues)
   │    · guarda SOLO sha256(retoId:usuarioId:codigo) en KV, TTL 5 min
   │    · lo envía por Brevo y responde el correo enmascarado (ju***@gmail.com)
   │    · si no hay correo → { tieneCorreo: false } y la app manda con el admin
   │
   └─ POST /recuperar/verificar  {retoId, usuarioId, codigo}
        · compara hashes en tiempo constante, máx. 5 intentos
        · libera el perfil: authUid=null, hasPassword=false, resetGen+1
        · el participante crea contraseña nueva por el onboarding de siempre
```

**No cambiamos la contraseña.** Al subir `resetGen`, la app genera un email
sintético nuevo (`-r{gen}`) y crea una cuenta fresca — exactamente lo que ya
hacía `adminRestablecerAcceso()`. Por eso no hace falta Admin SDK, cuenta de
servicio ni plan Blaze.

## Decisiones de seguridad

| | |
|---|---|
| El código nunca se guarda en claro | en KV vive solo su SHA-256 |
| Vigencia | 5 min por TTL nativo de KV (no depende de que alguien lo borre) |
| Reenvío | 1 por minuto y perfil |
| Intentos | 5 por código; al sexto se quema |
| Comparación | tiempo constante, no filtra por dónde difiere |
| Un código válido | se borra al usarse |
| Correos | en `correos/{usuarioId}`, no en `usuarios/{id}` — ese lo lee cualquier cuenta autenticada, incluso anónima |
| Identidad del Worker | cuenta propia, NO admin: las reglas solo le dejan leer un correo y liberar ese perfil |

Concesión conocida: la respuesta distingue "no tiene correo registrado" de
"sí lo tiene", porque el aviso de ir con el administrador lo necesita. Los
nombres de los participantes ya son públicos dentro de la app, así que no
añade información que no estuviera a la vista.

## Despliegue

### 1. Cuenta propia del Worker (una sola vez)

El Worker necesita una identidad en Firebase Auth para leer los correos y
liberar perfiles. **No uses la cuenta admin**: `firestore.rules` le da a esta
permisos mínimos y a nada más.

```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FIREBASE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"auth-worker@retogymfit.app","password":"<una-contraseña-larga-y-aleatoria>","returnSecureToken":true}'
```

Guarda el `refreshToken` de la respuesta: es el secret `WORKER_REFRESH_TOKEN`.
(La contraseña no se vuelve a usar; guárdala en tu gestor por si hay que
regenerar el token.)

### 2. KV

Ya creado: namespace `retogymfit-codigos-recuperacion`, id
`3920970229c0448c921ec40bcf919a1d`, referenciado en `wrangler.toml`.

### 3. Secrets

```bash
cd auth-worker
npm run secret:brevo          # BREVO_API_KEY
npm run secret:worker-token   # WORKER_REFRESH_TOKEN (paso 1)
```

### 4. Publicar

```bash
npm run deploy                        # crea auth-retogymfit.logidma.com
firebase deploy --only firestore:rules
```

## Remitente

Hoy sale de `davismartinesad@gmail.com`, el único verificado en Brevo (plan
free, 300 envíos/día). Para enviar desde `no-responder@logidma.com` hay que
autenticar el dominio en Brevo y añadir su DKIM y el `include:spf.brevo.com`
al SPF de `logidma.com` en Cloudflare — el SPF actual ya lleva Google y
Firebase, así que sería editarlo, no reemplazarlo.
