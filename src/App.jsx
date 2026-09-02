import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, TabBar, AnimeIntro, useToast, ConexionPill } from './components/ui';
import InstalarBanner from './components/InstalarBanner';
import CorreoBanner from './components/CorreoBanner';
import AvisoFotos from './components/AvisoFotos';
import { drenarCola } from './lib/sheets';
import { alRecibirPush } from './lib/push';
import { entradaPagina } from './lib/anim';
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

  // Transición de página con GSAP: cascada de los bloques de la pantalla.
  // El scroll se reinicia SIEMPRE al cambiar de ruta: sin esto, llegar a una
  // pantalla corta (p. ej. una publicación) hereda el scroll de la anterior
  // y el contenido queda fuera de vista.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!autenticado || esAdmin) return undefined;
    return entradaPagina(paginaRef.current?.firstElementChild);
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
