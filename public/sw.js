/* eslint-env serviceworker */
/**
 * Service worker de RETO GYM 2026.
 *
 *  1. PWA: cachea el app shell y los assets estáticos (stale-while-revalidate)
 *     para que la app instale como aplicación y abra al instante.
 *  2. Push: recibe mensajes de FCM en segundo plano y los muestra como
 *     notificación; al tocarla se abre/enfoca la app.
 *
 * Versiona el nombre del caché al cambiar estrategia para invalidar el viejo.
 */

/* ——— FCM (notificaciones en segundo plano) ——— */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDQwFU9hcM1iJbRJW5zArdhvlV-vqaRIQE',
  authDomain: 'retogymfit.firebaseapp.com',
  projectId: 'retogymfit',
  storageBucket: 'retogymfit.firebasestorage.app',
  messagingSenderId: '958410950039',
  appId: '1:958410950039:web:dbd276846395df0aa4f0d2',
});

const messaging = firebase.messaging();

// Mensajes con solo `data` (los de `notification` los muestra el navegador solo)
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  if (!d.title) return;
  self.registration.showNotification(d.title, {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: d.url || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abiertas) => {
      const app = abiertas.find((c) => c.url.includes(self.location.origin));
      if (app) { app.focus(); return app.navigate(url); }
      return clients.openWindow(url);
    }),
  );
});

/* ——— Caché del app shell ——— */
const CACHE = 'rgf-shell-v2.3.0';
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Solo mismo origen: Firestore/Auth/Storage van directo a la red
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero (SPA fresca), caché como respaldo offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => { caches.open(CACHE).then((c) => c.put('/', res.clone())); return res; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cacheada) => {
      const red = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cacheada);
      return cacheada || red;
    }),
  );
});
