/**
 * The install probe of docs/architecture.md §2.1.1, and nothing else.
 *
 * Two sources because WebKit has answered through both over the years: the
 * `display-mode: standalone` media query and the Apple-specific `navigator.standalone`
 * flag (§2.1.1 takes both, and the manifest, the meta tags and the query agree by
 * construction). The answer is advisory: iOS exposes no programmatic install (P-11),
 * so the only affordance the app can offer is the two taps written out as copy.
 *
 * The scope is a parameter rather than a global so the probe is testable without a DOM
 * and cannot throw on a browser that has no `matchMedia` at all.
 */

export interface InstallScope {
  readonly matchMedia?: ((query: string) => { readonly matches: boolean }) | undefined;
  readonly navigator?: { readonly standalone?: boolean | undefined } | undefined;
}

const STANDALONE_QUERY = '(display-mode: standalone)';

export function isInstalled(scope: InstallScope): boolean {
  let standalone = false;
  const matchMedia = scope.matchMedia;
  if (matchMedia !== undefined) {
    try {
      standalone = matchMedia(STANDALONE_QUERY).matches;
    } catch {
      // A browser that refuses the query is not an installed app by that route; the
      // Apple flag below still gets its say.
      standalone = false;
    }
  }
  return standalone || scope.navigator?.standalone === true;
}
