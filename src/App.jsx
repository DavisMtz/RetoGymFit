import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, TabBar, AnimeIntro } from './components/ui';
import { drenarCola } from './lib/sheets';
import Onboarding from './screens/Onboarding';
import Admin from './screens/Admin';
import Hoy from './screens/Hoy';
import Historial from './screens/Historial';
import Ranking from './screens/Ranking';
import Stats from './screens/Stats';
import Perfil from './screens/Perfil';

function Boot() {
  return (
    <div className="boot">
      <div className="boot-mark">R</div>
    </div>
  );
}

function Shell() {
  const { cargando, autenticado, esAdmin, reto, usuario } = useAuth();
  const location = useLocation();
  const [intro, setIntro] = useState(false);
  const previo = useRef(autenticado);

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
  if (!autenticado) return <Onboarding />;
  if (esAdmin) return <Admin />;

  return (
    <>
      {intro && <AnimeIntro nombre={usuario.nombre} genero={reto.genero} onDone={() => setIntro(false)} />}
      {/* key por ruta: cada pantalla entra con su transición */}
      <div className="page-transition" key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Hoy />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
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
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
