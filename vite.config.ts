import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repository from a subpath, so the base is fixed here and
// nowhere else. The service worker is registered with the `prompt` strategy: an update
// never replaces the running app under the owner's thumb (architecture §8).
//
// The icons are real files committed under `public/` (see tools/make-icons.mjs). Safari
// installs from `apple-touch-icon.png` in index.html; Chromium and Android install from
// these manifest entries, so the sizes and types here must match the bytes on disk.
export default defineConfig(({ mode }) => {
  /**
   * The cloud values (ADR-0002) arrive from the environment, and Vite does not read
   * `process.env` on its own: without this, a CI job that exports VITE_SUPABASE_URL built
   * a bundle with no project in it and the deployed app silently had no account.
   * `loadEnv` merges the `.env*` files with the prefixed process environment, and `define`
   * inlines the two values at build time, which is the only way a static app can receive
   * them. Absent values become empty strings, so an install without a project still builds.
   */
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const cloud = {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
  };

  return {
  base: '/rupfit/',
  define: cloud,
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
        icons: [
          {
            src: '/rupfit/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/rupfit/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/rupfit/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    // The visual-audit harness keeps Chromium profiles under tools/.tmp (gitignored).
    // Without this, every browser write is a file event and Vite reloads the page the
    // audit is standing on.
    watch: { ignored: ['**/tools/.tmp/**'] },
  },
  };
});
