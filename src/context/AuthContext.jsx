/**
 * Sesión del reto.
 *
 * Cómo funciona la autenticación:
 *  - Al abrir la app se inicia sesión anónima en Firebase (solo para poder
 *    leer la lista de participantes activos durante el onboarding).
 *  - Cada participante se mapea a una cuenta de Firebase Auth con un correo
 *    sintético `u-{usuarioId}@{retoId}.retogymfit.app` + la contraseña que
 *    elige la primera vez. La cuenta anónima se "convierte" (link) en esa
 *    cuenta, y el documento del participante guarda su authUid.
 *  - La sesión persiste en el dispositivo (browserLocalPersistence) junto con
 *    { retoId, usuarioId } en localStorage.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInAnonymously, onAuthStateChanged, signOut,
  EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updatePassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { getReto } from '../config/retos';
import { obtenerUsuario, marcarAcceso } from '../data/queries';

const SESSION_KEY = 'rgf_session_v1';
const ADMIN_EMAIL = 'admin@retogymfit.app';
const AuthContext = createContext(null);

function emailSintetico(retoId, usuarioId, resetGen = 0) {
  const slug = usuarioId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // resetGen>0 genera un email nuevo tras un reinicio de acceso del admin:
  // así la cuenta vieja queda huérfana y el participante crea una nueva
  // contraseña sin necesidad de tocar la consola de Firebase. Los usuarios
  // ya registrados (gen 0) conservan su email original.
  const sufijo = resetGen > 0 ? `-r${resetGen}` : '';
  return `u-${slug}${sufijo}@${retoId}.retogymfit.app`;
}

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [cargando, setCargando] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [sesion, setSesion] = useState(leerSesion); // { retoId, usuarioId }
  const [usuario, setUsuario] = useState(null);     // doc del participante
  const reto = sesion ? getReto(sesion.retoId) : null;

  // Tope de arranque: si Firebase no responde (sin red, config incompleta),
  // no dejamos al usuario atorado en el loader.
  useEffect(() => {
    const t = setTimeout(() => setCargando(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Mantener viva la sesión de Firebase (anónima si no hay login)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch {
          // Sin red o config incompleta: deja pasar al onboarding,
          // que mostrará el error al intentar cargar la lista.
          setCargando(false);
        }
        return;
      }
      setFirebaseUser(u);
      setCargando(false);
    });
    return unsub;
  }, []);

  // Cargar el perfil del participante cuando hay sesión válida
  useEffect(() => {
    let activo = true;
    (async () => {
      if (!sesion || !firebaseUser || firebaseUser.isAnonymous) { setUsuario(null); return; }
      // Sesión de super usuario: no hay documento de participante que validar
      if (sesion.admin) {
        if (firebaseUser.email === ADMIN_EMAIL) setUsuario({ id: '__admin__', nombre: 'Administrador' });
        else { localStorage.removeItem(SESSION_KEY); setSesion(null); setUsuario(null); }
        return;
      }
      const u = await obtenerUsuario(sesion.retoId, sesion.usuarioId);
      if (!activo) return;
      // La sesión solo es válida si este dispositivo es dueño del perfil
      if (u && u.authUid === firebaseUser.uid && u.estado === 'Activo') setUsuario(u);
      else { localStorage.removeItem(SESSION_KEY); setSesion(null); setUsuario(null); }
    })();
    return () => { activo = false; };
  }, [sesion, firebaseUser]);

  /**
   * Primera vez: crear contraseña y reclamar el perfil. El reclamo lo hace
   * la Cloud Function `reclamarPerfil`, que exige el código del equipo —
   * un extraño ya no puede apropiarse de perfiles sin contraseña. Si el
   * reclamo falla, la cuenta recién creada se deshace para no dejarla
   * huérfana.
   */
  const crearCuenta = useCallback(async (retoId, usuarioDoc, password, codigo) => {
    const email = emailSintetico(retoId, usuarioDoc.id, usuarioDoc.resetGen || 0);
    const cred = EmailAuthProvider.credential(email, password);
    let user;
    if (auth.currentUser?.isAnonymous) {
      ({ user } = await linkWithCredential(auth.currentUser, cred));
      // refrescar el token para que el backend vea el email ya vinculado
      await user.getIdToken(true);
    } else {
      ({ user } = await createUserWithEmailAndPassword(auth, email, password));
    }
    try {
      await httpsCallable(functions, 'reclamarPerfil')({
        retoId,
        usuarioId: usuarioDoc.id,
        nombre: usuarioDoc.nombre,
        codigo,
      });
    } catch (err) {
      try { await user.delete(); } catch { await signOut(auth); }
      throw err;
    }
    const s = { retoId, usuarioId: usuarioDoc.id };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setFirebaseUser(user);
    setSesion(s);
  }, []);

  /** Acceso normal con contraseña existente */
  const iniciarSesion = useCallback(async (retoId, usuarioDoc, password) => {
    const email = emailSintetico(retoId, usuarioDoc.id, usuarioDoc.resetGen || 0);
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await marcarAcceso(retoId, usuarioDoc.id, user.uid);
    const s = { retoId, usuarioId: usuarioDoc.id };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setFirebaseUser(user);
    setSesion(s);
  }, []);

  /** Acceso del super usuario administrador */
  const iniciarSesionAdmin = useCallback(async (password) => {
    const { user } = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, password);
    const s = { admin: true };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setFirebaseUser(user);
    setSesion(s);
  }, []);

  const cerrarSesion = useCallback(async () => {
    localStorage.removeItem(SESSION_KEY);
    setSesion(null);
    setUsuario(null);
    await signOut(auth); // onAuthStateChanged vuelve a entrar como anónimo
  }, []);

  /**
   * Descarta la sesión guardada sin cerrar sesión en Firebase (útil como
   * escape si la reconexión se atora: funciona aun sin red). Lleva al
   * onboarding para volver a entrar a mano.
   */
  const olvidarSesion = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSesion(null);
    setUsuario(null);
  }, []);

  const cambiarPassword = useCallback(async (nueva) => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) throw new Error('Sin sesión');
    await updatePassword(auth.currentUser, nueva);
  }, []);

  // Actualiza campos del participante en memoria (p. ej. photoURL tras subir foto)
  const refrescarUsuario = useCallback((campos) => {
    setUsuario((u) => (u ? { ...u, ...campos } : u));
  }, []);

  const esAdmin = Boolean(sesion?.admin && usuario);
  const autenticado = Boolean(usuario && reto) || esAdmin;
  const value = {
    cargando,
    autenticado,
    esAdmin,
    // Hay una sesión guardada que aún no resuelve a un perfil válido:
    // Firebase está reconectando. Evita mostrar el onboarding (que se
    // sentiría como "me cerró la sesión") mientras tanto.
    reconectando: Boolean(sesion) && !autenticado,
    reto,
    usuario,
    crearCuenta,
    iniciarSesion,
    iniciarSesionAdmin,
    cerrarSesion,
    olvidarSesion,
    cambiarPassword,
    refrescarUsuario,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
