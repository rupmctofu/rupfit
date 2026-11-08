/**
 * `src/pwa/` — the app tier's platform module: the service worker, the gate that
 * decides whether this launch registers it, and the waiting-worker watch.
 *
 * Browser APIs only (architecture §4): no `react`, no `src/core`, no `src/storage`, no
 * feature. `src/app` is the only caller — it wires the watch at the root and hands the
 * same instance to Perfil.
 */

export {
  registrationDecision,
  serviceWorkerUrl,
  type RegistrationDecision,
  type RegistrationGate,
} from './registration';
export {
  createServiceWorkerWatch,
  type UpdateRuntime,
  type UpdateWatch,
  type UpdateWatchOptions,
} from './service-worker';
export {
  appUpdateWatch,
  browserEnvironment,
  registerServiceWorker,
  type ServiceWorkerEnvironment,
} from './update';
