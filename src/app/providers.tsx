/**
 * The composition root's container: the one storage instance and the one clock.
 *
 * Created once and memoised for the lifetime of the app, then handed down through
 * context. A screen never constructs a port, never opens a database and never reads
 * `Date.now()` on its own: it asks for `storage` or `now`, and a test or the demo can
 * replace either without touching the screen.
 *
 * Construction is side-effect free (`createStorage` opens nothing until a read or a
 * write asks it to), so rendering `#/sesion/demo` — which passes its own in-memory port
 * — never touches IndexedDB.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createStorage, type StoragePort } from '../storage';
import type { Clock, SessionJournal } from '../features/session/controller';
import { createSessionStorageJournal } from '../features/session/journal';
import {
  appUpdateWatch,
  serviceWorkerUrl,
  type UpdateWatch,
  type UpdateWatchOptions,
} from '../pwa';

export interface AppServices {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** The session journal: the card on screen and the rest bar, for this launch only. */
  readonly journal: SessionJournal;
}

/** The only wall clock the app has. Injected everywhere, so a test can pin it. */
export const systemClock: Clock = { now: () => Date.now() };

export function createAppServices(): AppServices {
  return {
    storage: createStorage(),
    clock: systemClock,
    journal: createSessionStorageJournal(),
  };
}

const AppServicesContext = createContext<AppServices | null>(null);

export interface AppProviderProps {
  readonly children: ReactNode;
  /** Injected by a test; the app creates the real one, once. */
  readonly services?: AppServices | undefined;
}

export function AppProvider({ children, services }: AppProviderProps): React.ReactElement {
  const [value] = useState<AppServices>(() => services ?? createAppServices());
  return <AppServicesContext.Provider value={value}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === null) throw new Error('useAppServices must be used inside AppProvider');
  return services;
}

/*
 * The service worker, across the feature boundary.
 *
 * `src/pwa/` owns registration and the waiting-worker watch and the app root drives it
 * on launch (architecture §8). A feature may not import `src/pwa` (§4), and Perfil's one
 * reader — `src/features/profile/useProfileData.ts` — asks for a watch from its own
 * folder, so the composition root hands the app's single instance over here.
 */

export { serviceWorkerUrl } from '../pwa';
export type { UpdateRuntime, UpdateWatch } from '../pwa';

/**
 * The app's watch, under the signature Perfil already calls. The first caller wins the
 * environment (it is the same container, script and reload either way); every later one
 * joins the same instance, so there is exactly one registration per launch.
 */
export function createServiceWorkerWatch(options?: UpdateWatchOptions): UpdateWatch {
  return appUpdateWatch({
    production: import.meta.env.PROD,
    container: options?.container ?? null,
    scriptUrl: options?.scriptUrl ?? serviceWorkerUrl(import.meta.env.BASE_URL),
    reload: options?.reload ?? (() => window.location.reload()),
  });
}
