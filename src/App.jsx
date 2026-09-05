import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, TabBar, AnimeIntro, useToast, ConexionPill } from './components/ui';
import InstalarBanner from './components/InstalarBanner';
import CorreoBanner from './components/CorreoBanner';
import PapelPicado from './components/PapelPicado';
import PatrioBienvenida from './components/PatrioBienvenida';
import AvisoFotos from './components/AvisoFotos';
import { drenarCola } from './lib/sheets';
import { alRecibirPush } from './lib/push';
import { entradaPagina } from './lib/anim';
import { vigilarPatrio, apagarPatrio, suscribirPatrio, yaVioBienvenida } from './lib/patrio';
import Onboarding from './screens/Onboarding';
import Hoy from './screens/Hoy';
import Feed from './screens/Feed';
import PostDetalle from './screens/PostDetalle';
import Historial from './screens/Historial';
import Ranking from './screens/Ranking';
import Stats from './screens/Stats';
import Perfil from './screens/Perfil';

// El panel de administración solo lo usa el super usuario: se carga bajo
// demanda para no pesar en el arranque de los participantes.
const Admin = lazy(() => import('./screens/Admin'));

// El orden REAL de la barra de pestañas. De aquí sale la dirección de la
// transición: si te mueves a una pestaña de más a la derecha, la pantalla
// nueva entra por la derecha. Sin esto, todas las pantallas entran igual y
// la app se siente como un sitio web con enlaces, no como una app.
const ORDEN_TABS = ['/', '/feed', '/historial', '/ranking', '/stats', '/perfil'];

function Boot() {
  return (
    <div className="boot">
      <div className="boot-mark">R</div>
    </div>
  );
}

/**
 * Pantalla de reconexión: se muestra cuando hay una sesión guardada pero
 * Firebase aún no responde (señal lenta del gym). Evita el parpadeo de
 * onboarding. Tras unos segundos ofrece una salida manual por si se atora.
 */
function Reconectando({ onSalir }) {
  const [mostrarSalida, setMostrarSalida] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMostrarSalida(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="boot">
      <div className="boot-mark">R</div>
      <p className="boot-msg">Reconectando…</p>
      {mostrarSalida && (
        <button className="boot-salir" type="button" onClick={onSalir}>
          ¿Tarda mucho? Ir al inicio
        </button>
      )}
    </div>
  );
}

function Shell() {
  const { cargando, autenticado, esAdmin, reconectando, reto, usuario, olvidarSesion } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [intro, setIntro] = useState(false);
  const previo = useRef(autenticado);
  const paginaRef = useRef(null);
  const rutaPrevia = useRef(location.pathname);
  const [patrio, setPatrio] = useState(false);        // ¿tema patrio encendido?
  const [bienvenida, setBienvenida] = useState(false); // ¿toca el modal de una vez?
  const [guirnalda, setGuirnalda] = useState(false);   // ¿sigue montado el papel picado?

  // El tema patrio es CSS (html[data-patrio]) MÁS lo que React monta aparte:
  // la guirnalda de papel picado. Esta suscripción mantiene juntas a las dos
  // mitades — sin ella, apagarlo desde Perfil quitaba el atributo pero dejaba
  // la guirnalda colgada, y encima sin el padding que le hacía hueco, así que
  // terminaba tapando la cabecera.
  useEffect(() => suscribirPatrio(setPatrio), []);

  // Fecha → interruptor global del admin (en vivo) → preferencia personal.
  // Se re-suscribe al cambiar de reto porque el interruptor global es por
  // reto. Aquí no se toca el estado `patrio`: lo mueve solo la suscripción
  // de arriba, para que haya UNA sola fuente de verdad.
  useEffect(() => {
    if (!autenticado || esAdmin || !reto) { apagarPatrio(); return undefined; }
    return vigilarPatrio(reto.id);
  }, [autenticado, esAdmin, reto]);

  // El modal de bienvenida, una sola vez por temporada, en cuanto el tema
  // quede encendido de verdad.
  useEffect(() => {
    if (patrio && !yaVioBienvenida()) setBienvenida(true);
  }, [patrio]);

  // La guirnalda se queda un momento más que el tema para que se la lleve el
  // aire en vez de esfumarse. El temporizador la desmonta pase lo que pase
  // con la animación: apagar el tema NUNCA puede dejarla colgada.
  useEffect(() => {
    if (patrio) { setGuirnalda(true); return undefined; }
    if (!guirnalda) return undefined;
    const t = setTimeout(() => setGuirnalda(false), 720);
    return () => clearTimeout(t);
  }, [patrio, guirnalda]);

  // Transición de página con GSAP: cascada de los bloques de la pantalla,
  // entrando por el lado del que vienes.
  // El scroll se reinicia SIEMPRE al cambiar de ruta: sin esto, llegar a una
  // pantalla corta (p. ej. una publicación) hereda el scroll de la anterior
  // y el contenido queda fuera de vista.
  useEffect(() => {
    // Instantaneo a proposito: el CSS pone `scroll-behavior: smooth` en el
    // html, y con eso un cambio de pantalla se iba desplazando solo mientras
    // la pantalla nueva ya estaba entrando. Una pantalla nueva empieza
    // arriba, no viajando.
    window.scrollTo({ top: 0, behavior: 'instant' });
    const anterior = rutaPrevia.current;
    rutaPrevia.current = location.pathname;
    if (!autenticado || esAdmin) return undefined;
    const destino = ORDEN_TABS.indexOf(location.pathname);
    const origen = ORDEN_TABS.indexOf(anterior);
    // Solo hay dirección entre dos pestañas: llegar por un enlace (una
    // publicación compartida) entra de abajo, que es la entrada neutral.
    const direccion = destino !== -1 && origen !== -1 && destino !== origen
      ? Math.sign(destino - origen)
      : 0;
    return entradaPagina(paginaRef.current?.firstElementChild, { direccion });
  }, [location.pathname, autenticado, esAdmin]);

  // Push en primer plano: si llega una notificación con la app abierta,
  // se muestra como toast en lugar de notificación del sistema.
  useEffect(() => {
    if (!autenticado) return undefined;
    return alRecibirPush((payload) => {
      const n = payload?.notification || payload?.data;
      if (n?.title) toast(`${n.title}${n.body ? ` — ${n.body}` : ''}`);
    });
  }, [autenticado, toast]);

  // Intro cinemática cuando pasas de "no autenticado" a "dentro"
  useEffect(() => {
    if (autenticado && !esAdmin && !previo.current) setIntro(true);
    previo.current = autenticado;
  }, [autenticado, esAdmin]);

  // Tema del reto en el body + drenar cola de sincronización a Sheets
  useEffect(() => {
    document.body.dataset.reto = reto?.id || '';
    if (autenticado) drenarCola();
  }, [reto, autenticado]);

  if (cargando) return <Boot />;
  // Publicación compartida por link: se puede VER sin sesión de participante
  // (la app entra como anónimo a Firebase, suficiente para leer). La vista
  // es de solo lectura; para reaccionar o comentar hay que entrar al reto.
  if (!autenticado && location.pathname.startsWith('/post/')) {
    return (
      <Routes location={location}>
        <Route path="/post/:retoId/:postId" element={<PostDetalle />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  if (!autenticado) return reconectando ? <Reconectando onSalir={olvidarSesion} /> : <Onboarding />;
  if (esAdmin) return <Suspense fallback={<Boot />}><Admin /></Suspense>;

  return (
    <>
      {intro && <AnimeIntro nombre={usuario.nombre} genero={reto.genero} onDone={() => setIntro(false)} />}
      {/* key por ruta: cada pantalla entra con su transición (GSAP) */}
      <div className="page-transition" key={location.pathname} ref={paginaRef}>
        <Routes location={location}>
          <Route path="/" element={<Hoy />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/post/:retoId/:postId" element={<PostDetalle />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {guirnalda && <PapelPicado saliendo={!patrio} />}
      {bienvenida && <PatrioBienvenida onCerrar={() => setBienvenida(false)} />}
      <InstalarBanner />
      <CorreoBanner />
      <AvisoFotos />
      <TabBar />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <Shell />
          <ConexionPill />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
