import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';

// Config del proyecto retogymfit. La config web de Firebase no es secreta:
// la seguridad real vive en las reglas de Firestore (firestore.rules).
// Un .env con VITE_FIREBASE_* la sobreescribe si algún día cambias de proyecto.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDQwFU9hcM1iJbRJW5zArdhvlV-vqaRIQE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'retogymfit.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'retogymfit',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'retogymfit.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '958410950039',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:958410950039:web:dbd276846395df0aa4f0d2',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// Cache local persistente: la app abre al instante y funciona sin señal en el gym
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});
