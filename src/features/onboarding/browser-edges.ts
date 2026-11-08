/**
 * The browser edges of the setup — the only file in this folder that names a platform API.
 *
 * One function, and it exists for the same reason `src/features/profile/browser-edges.ts`
 * has its own copy: a feature may not import another feature folder (architecture §4), and
 * the profile id must not be derived from `Date.now()` inside a component.
 */

/**
 * A profile id. `randomUUID` is only exposed in a secure context, which GitHub Pages is;
 * the fallback takes the instant from the injected clock, so a component never reads one of
 * its own and a test can pin it.
 */
export function createProfileId(now: number): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID !== undefined) return webCrypto.randomUUID();
  return `profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
