"""
Prueba las reglas de Firestore contra el emulador.

Cubre el permiso que usa auth-worker/ para liberar un perfil cuando alguien
recupera su contraseña: que funcione en el caso bueno y que NO se pueda abusar
—otra cuenta, cambiar campos de más, un perfil dado de baja—.

Se corre contra el emulador y no contra producción a propósito: probar reglas
en vivo implica escribir en datos reales de participantes.

    npx firebase emulators:exec --only firestore "python3 test/reglas_firestore.py"

o, con el emulador ya levantado en 127.0.0.1:8080:

    python3 test/reglas_firestore.py

El emulador no verifica la firma de los ID token, así que se fabrican tokens
sin firmar con los claims que interesan. `Bearer owner` salta las reglas y se
usa solo para sembrar el documento de partida.
"""
import base64, json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8080/v1/projects/retogymfit/databases/(default)/documents"
DOC = "retos/mixto/usuarios/juan-perez"

def jwt(email, uid="uid-worker"):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
    return f'{b({"alg":"none","typ":"JWT"})}.{b({"aud":"retogymfit","iss":"https://securetoken.google.com/retogymfit","sub":uid,"user_id":uid,"email":email,"iat":1,"exp":9999999999,"firebase":{"sign_in_provider":"password","identities":{"email":[email]}}})}.'

def pedir(metodo, ruta, token, cuerpo=None):
    req = urllib.request.Request(f"{BASE}/{ruta}", method=metodo,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(cuerpo).encode() if cuerpo else None)
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:150]

def sembrar():
    pedir("DELETE", DOC, "owner")
    return pedir("PATCH", DOC + "?updateMask.fieldPaths=nombre&updateMask.fieldPaths=estado"
                 "&updateMask.fieldPaths=authUid&updateMask.fieldPaths=hasPassword"
                 "&updateMask.fieldPaths=resetGen", "owner",
        {"fields": {"nombre": {"stringValue": "Juan"}, "estado": {"stringValue": "Activo"},
                    "authUid": {"stringValue": "uid-viejo"}, "hasPassword": {"booleanValue": True},
                    "resetGen": {"integerValue": "0"}}})

def liberar(token, extra=None, mask=("authUid", "hasPassword", "resetGen")):
    campos = {"authUid": {"nullValue": None}, "hasPassword": {"booleanValue": False},
              "resetGen": {"integerValue": "1"}}
    if extra: campos.update(extra)
    q = "&".join(f"updateMask.fieldPaths={c}" for c in mask)
    return pedir("PATCH", f"{DOC}?{q}", token, {"fields": campos})

WORKER = jwt("auth-worker@retogymfit.app")
OTRO   = jwt("u-juan-perez@mixto.retogymfit.app", "uid-otro")

casos = []
sembrar(); c, _ = liberar(WORKER)
casos.append(("El Worker libera un perfil Activo", c == 200, c, "debe PERMITIR"))

sembrar(); c, _ = liberar(OTRO)
casos.append(("Otra cuenta intenta liberarlo", c != 200, c, "debe DENEGAR"))

sembrar(); c, _ = liberar(WORKER, {"nombre": {"stringValue": "HACKEADO"}},
                          ("authUid", "hasPassword", "resetGen", "nombre"))
casos.append(("El Worker intenta cambiar el nombre", c != 200, c, "debe DENEGAR"))

sembrar()
pedir("PATCH", DOC + "?updateMask.fieldPaths=estado", "owner",
      {"fields": {"estado": {"stringValue": "Baja"}}})
c, _ = liberar(WORKER)
casos.append(("Perfil dado de baja", c != 200, c, "debe DENEGAR"))

sembrar(); c, _ = liberar(WORKER, {"hasPassword": {"booleanValue": True}})
casos.append(("Liberar dejando hasPassword=true", c != 200, c, "debe DENEGAR"))

fallos = 0
for nombre, ok, code, esperado in casos:
    if not ok: fallos += 1
    print(f"  {'✓' if ok else '✗ FALLO'} {nombre:38} HTTP {code:3}  ({esperado})")
print(f"\n  {'✓ las reglas hacen exactamente lo que dicen' if not fallos else f'✗ {fallos} fallos'}")
raise SystemExit(1 if fallos else 0)
