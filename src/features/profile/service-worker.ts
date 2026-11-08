/**
 * The service worker registration and the waiting-worker watch.
 *
 * **`src/pwa/` is the eventual home of this file** (task T8 owns the service worker,
 * the offline shell and the install/update prompts). It lives here because Perfil is
 * the screen that has to show the update state and nothing in `src/pwa/` existed yet;
 * the module is deliberately narrow so moving it is a `git mv` and one import.
 *
 * Two rules, both from `vite.config.ts` (`registerType: 'prompt'`) and design-system
 * §7.8:
 *
 * - Registration never happens in development: `vite dev` serves no `sw.js`, so a
 *   failed registration there would only produce noise.
 * - A waiting worker is *reported*, never activated behind the owner's back. The screen
 *   decides when to send `SKIP_WAITING`, and only while no session is running.
 *
 * The workbox-generated worker answers `{ type: 'SKIP_WAITING' }` by calling
 * `skipWaiting()`, which is what makes the `controllerchange` that follows a reload.
 */

export interface UpdateRuntime {
  /** A new worker is installed and waiting to take over. */
  readonly waiting: boolean;
  readonly registered: boolean;
  /** Why registration failed, in Spanish, or `null`. Never an alarm: offline is optional. */
  readonly detail: string | null;
}

export interface UpdateWatch {
  runtime(): UpdateRuntime;
  subscribe(listener: () => void): () => void;
  /** Registers once per launch; idempotent. */
  register(): void;
  /** Hands over to the waiting worker; the caller reloads on `controllerchange`. */
  applyUpdate(): void;
}

const IDLE: UpdateRuntime = { waiting: false, registered: false, detail: null };

export interface UpdateWatchOptions {
  readonly container: ServiceWorkerContainer | null;
  /** `/rupfit/sw.js` — built from `import.meta.env.BASE_URL`, never hard-coded. */
  readonly scriptUrl: string;
  readonly reload: () => void;
}

export function createServiceWorkerWatch(options: UpdateWatchOptions): UpdateWatch {
  const { container, scriptUrl, reload } = options;
  const listeners = new Set<() => void>();
  let state: UpdateRuntime = IDLE;
  let registration: ServiceWorkerRegistration | null = null;
  let applying = false;

  const publish = (next: Partial<UpdateRuntime>): void => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };

  if (container !== null) {
    container.addEventListener('controllerchange', () => {
      if (!applying) return;
      applying = false;
      reload();
    });
  }

  const watchInstalling = (target: ServiceWorkerRegistration): void => {
    const installing = target.installing;
    if (installing === null) return;
    installing.addEventListener('statechange', () => {
      // `installed` with an active controller means this build is replacing another one.
      if (installing.state === 'installed' && container !== null && container.controller !== null) {
        publish({ waiting: true });
      }
    });
  };

  return {
    runtime: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    register: () => {
      if (registration !== null) return;
      if (container === null) {
        publish({ detail: 'Este navegador no ofrece service worker.' });
        return;
      }

      container
        .register(scriptUrl)
        .then((registered) => {
          registration = registered;
          publish({ registered: true, waiting: registered.waiting !== null });
          registered.addEventListener('updatefound', () => watchInstalling(registered));
          if (registered.installing !== null) watchInstalling(registered);
          // Ask the network once this launch: the answer decides whether a banner appears.
          void registered.update().catch(() => undefined);
        })
        .catch((error: unknown) => {
          publish({
            detail: error instanceof Error ? error.message : 'No se pudo registrar el service worker.',
          });
        });
    },
    applyUpdate: () => {
      const waiting = registration?.waiting ?? null;
      if (waiting === null) return;
      applying = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
  };
}

/** The worker `vite.config.ts` builds at the deployed base: `/rupfit/sw.js` here. */
export function serviceWorkerUrl(baseUrl: string): string {
  return `${baseUrl}sw.js`;
}
