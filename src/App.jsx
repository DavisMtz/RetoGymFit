import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, TabBar, AnimeIntro } from './components/ui';
import { drenarCola } from './lib/sheets';
import { RETOS } from './config/retos';
import Onboarding from './screens/Onboarding';
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
  const { cargando, autenticado, reto, usuario } = useAuth();
  const [intro, setIntro] = useState(false);
  const previo = useRef(autenticado);

  // Intro cinemática cuando pasas de "no autenticado" a "dentro"
  useEffect(() => {
    if (autenticado && !previo.current) setIntro(true);
    previo.current = autenticado;
  }, [autenticado]);

  // Tema del reto en el body + drenar cola de sincronización a Sheets
  useEffect(() => {
    document.body.dataset.reto = reto?.id || '';
    if (autenticado) drenarCola(RETOS);
  }, [reto, autenticado]);

  if (cargando) return <Boot />;
  if (!autenticado) return <Onboarding />;

  return (
    <>
      {intro && <AnimeIntro nombre={usuario.nombre} genero={reto.genero} onDone={() => setIntro(false)} />}
      <Routes>
        <Route path="/" element={<Hoy />} />
        <Route path="/historial" element={<Historial />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
