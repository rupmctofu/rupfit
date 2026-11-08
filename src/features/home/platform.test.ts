/**
 * The install probe of docs/architecture.md §2.1.1.
 *
 * Two sources because WebKit has answered through both over the years: the
 * `display-mode: standalone` media query and the Apple-specific `navigator.standalone`
 * flag. The answer is advisory (P-11: Safari exposes no programmatic install), so the
 * probe takes the surface it reads as an argument and never reaches for a global: a
 * probe that reads `window` cannot be tested outside a browser, and this suite has no
 * DOM environment.
 */

import { describe, expect, it } from 'vitest';
import { isInstalled, type InstallScope } from './platform';

function scope(overrides: Partial<InstallScope> = {}): InstallScope {
  return { ...overrides };
}

describe('isInstalled', () => {
  it('says installed when the display mode is standalone', () => {
    expect(
      isInstalled(scope({ matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' }) })),
    ).toBe(true);
  });

  it('says installed when only the Apple flag answers', () => {
    expect(isInstalled(scope({ navigator: { standalone: true } }))).toBe(true);
  });

  it('says not installed in a Safari tab', () => {
    expect(isInstalled(scope({ matchMedia: () => ({ matches: false }), navigator: {} }))).toBe(false);
  });

  it('treats a missing or throwing media query as not installed, never as an error', () => {
    expect(isInstalled(scope())).toBe(false);
    expect(
      isInstalled(
        scope({
          matchMedia: () => {
            throw new Error('matchMedia is not available');
          },
        }),
      ),
    ).toBe(false);
  });
});
