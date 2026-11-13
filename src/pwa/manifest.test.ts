import { describe, expect, it } from 'vitest';
import { manifestFor } from './manifest';

/**
 * The manifest is the one piece of the deployment base an installed app keeps forever: a
 * wrong `scope` or a wrong icon path survives reinstall and cannot be fixed from the server.
 * It was hardcoded to the Pages subpath, so a root deployment declared `/rupfit/` and asked
 * for three icons that live at `/`. These assertions are that guard.
 */
describe('the web manifest', () => {
  it('mounts at the root when the app is deployed at the root', () => {
    const manifest = manifestFor('/');

    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icon-192.png',
      '/icon-512.png',
      '/icon-512-maskable.png',
    ]);
  });

  it('mounts under the subpath when the app is deployed there', () => {
    const manifest = manifestFor('/rupfit/');

    expect(manifest.start_url).toBe('/rupfit/');
    expect(manifest.scope).toBe('/rupfit/');
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/rupfit/icon-192.png',
      '/rupfit/icon-512.png',
      '/rupfit/icon-512-maskable.png',
    ]);
  });

  it('names the maskable icon as maskable and nothing else', () => {
    const purposes = manifestFor('/').icons.map((icon) => icon.purpose);

    expect(purposes).toEqual(['any', 'any', 'maskable']);
  });
});
