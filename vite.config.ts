import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repository from a subpath, so the base is fixed here and
// nowhere else. The service worker is registered with the `prompt` strategy: an update
// never replaces the running app under the owner's thumb (architecture §8).
export default defineConfig({
  base: '/rupfit/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/rupfit/index.html',
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Rupfit',
        short_name: 'Rupfit',
        description: 'Entrenamiento de fuerza con decisiones, no con hojas de cálculo.',
        lang: 'es',
        start_url: '/rupfit/',
        scope: '/rupfit/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
