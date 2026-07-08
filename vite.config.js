import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Separa las dependencias pesadas en chunks propios: el navegador
        // los cachea entre despliegues y el arranque descarga menos JS crítico.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('firebase') || id.includes('@firebase') || id.includes('@grpc') || id.includes('protobufjs')) return 'firebase';
          if (id.includes('gsap')) return 'gsap';
          if (id.includes('canvas-confetti')) return 'confetti';
          if (id.includes('react')) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
