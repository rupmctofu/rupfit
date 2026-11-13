/**
 * The web manifest, built from the deployment base.
 *
 * It used to be a literal inside `vite.config.ts` with `/rupfit/` written into `start_url`,
 * `scope` and the three icon paths. The moment the app gained a second home - Vercel at the
 * root, GitHub Pages under the repository subpath - that literal became a bug: on a root
 * deployment the app declared a scope it does not own and pointed at three icons that are
 * served from `/`. Keeping it here, as a function of the base, is what makes that testable
 * without building anything.
 *
 * The icons are real files committed under `public/` (see `tools/make-icons.mjs`). Safari
 * installs from `apple-touch-icon.png` in `index.html`; Chromium and Android install from
 * these entries, so the sizes and types here must match the bytes on disk.
 */

/** One manifest icon: a file under `public/`, mounted at the deployment base. */
export interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: 'any' | 'maskable';
}

/** The parts of the web manifest this app declares. */
export interface WebManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly lang: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: string;
  readonly orientation: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly ManifestIcon[];
}

/**
 * The manifest for a deployment mounted at `base`.
 *
 * @param base: the mount point, with its trailing slash - `/` or `/rupfit/`. The caller owns
 *   that shape; `vite.config.ts` reads it from `APP_BASE_PATH`.
 * @returns the manifest with every path already carrying the base, so an installed app opens
 *   the page it was installed from and finds its own icons.
 */
export function manifestFor(base: string): WebManifest {
  return {
    name: 'Rupfit',
    short_name: 'Rupfit',
    description: 'Entrenamiento de fuerza con decisiones, no con hojas de cálculo.',
    lang: 'es',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${base}icon-512-maskable.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
