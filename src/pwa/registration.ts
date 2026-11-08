/**
 * Whether this launch registers the generated worker — architecture §8, specs S2/S3.
 *
 * Two facts decide it and nothing else does: `vite dev` serves no `sw.js`, so a
 * development registration could only fail and print noise; and a browser without
 * service workers has nothing to register into. The decision is a value rather than a
 * branch next to `navigator`, so the app root and Perfil ask the same question and get
 * the same answer, and a test can pin both halves without a DOM.
 *
 * Registering in production is not the same as activating: `vite.config.ts` builds
 * with `registerType: 'prompt'`, `skipWaiting` is never called on install, and the
 * waiting worker is only handed over by the owner's explicit `applyUpdate()`.
 */

export interface RegistrationGate {
  /** `import.meta.env.PROD`. Development never registers. */
  readonly production: boolean;
  /** `'serviceWorker' in navigator`: there is a container to register into. */
  readonly supported: boolean;
}

export type RegistrationDecision =
  | { readonly register: false; readonly reason: 'development' | 'unsupported' }
  | { readonly register: true };

export function registrationDecision(gate: RegistrationGate): RegistrationDecision {
  if (!gate.production) return { register: false, reason: 'development' };
  if (!gate.supported) return { register: false, reason: 'unsupported' };
  return { register: true };
}

/** The worker `vite.config.ts` builds at the deployed base: `/rupfit/sw.js` here. */
export function serviceWorkerUrl(baseUrl: string): string {
  return `${baseUrl}sw.js`;
}
