/**
 * The service worker's one owner — architecture §4 and §8, specs S1/S3, tasks T7/T8.
 *
 * Registration and the waiting-worker watch used to live in
 * `src/features/profile/service-worker.ts` and only ran when Perfil was opened, so a
 * fresh install was not offline-covered until the owner visited that tab. They live
 * here now: the app root registers on launch, Perfil only reads the watch.
 *
 * The policy is not configurable from here:
 *
 * - a production build only (`registrationDecision`), because `vite dev` has no
 *   `sw.js` and a failed registration there is pure noise;
 * - `prompt`, never `skipWaiting` automatically. The waiting worker is reported, and
 *   the hand-over only happens through `applyUpdate()`, which
 *   `src/features/profile/update-state.ts` refuses to offer while a session is running.
 *
 * One watch per launch: two instances would register the same script twice and let the
 * root and Perfil disagree about whether an update is waiting.
 */

import { registrationDecision, serviceWorkerUrl } from './registration';
import { createServiceWorkerWatch, type UpdateWatch } from './service-worker';

export interface ServiceWorkerEnvironment {
  /** `import.meta.env.PROD`. */
  readonly production: boolean;
  readonly container: ServiceWorkerContainer | null;
  /** `/rupfit/sw.js`, built from `import.meta.env.BASE_URL`, never hard-coded. */
  readonly scriptUrl: string;
  readonly reload: () => void;
}

/** This launch's browser. Injected by a test, and resolved once by the composition root. */
export function browserEnvironment(): ServiceWorkerEnvironment {
  return {
    production: import.meta.env.PROD,
    container:
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null,
    scriptUrl: serviceWorkerUrl(import.meta.env.BASE_URL),
    reload: () => window.location.reload(),
  };
}

let shared: UpdateWatch | null = null;

/**
 * The one watch this launch has. The root registers it and subscribes from there;
 * Perfil subscribes to the same instance through the composition root, because a
 * feature may not import `src/pwa` (architecture §4).
 */
export function appUpdateWatch(
  environment: ServiceWorkerEnvironment = browserEnvironment(),
): UpdateWatch {
  shared ??= createServiceWorkerWatch(environment);
  return shared;
}

/**
 * Registers the generated worker once per launch, and only in a production build.
 * Returns whether it registered: in development and in a browser without service
 * workers it declines, and the app still runs (offline is optional, §8).
 */
export function registerServiceWorker(
  environment: ServiceWorkerEnvironment = browserEnvironment(),
): boolean {
  const decision = registrationDecision({
    production: environment.production,
    supported: environment.container !== null,
  });
  if (!decision.register) return false;
  appUpdateWatch(environment).register();
  return true;
}
