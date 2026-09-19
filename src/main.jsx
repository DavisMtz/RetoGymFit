import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/fonts.css';
import './styles/global.css';
import './styles/patrio.css';
import { obtenerTema, aplicarTema } from './lib/tema';

// Aplica el tema guardado ANTES del primer render para evitar el destello
aplicarTema(obtenerTema());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: registra el service worker (caché del shell + notificaciones push).
// Solo en producción — en dev, Vite sirve los módulos sin build.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW la app sigue funcionando */ });
  });
}
