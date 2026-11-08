/**
 * Perfil's seam to the service worker — which no longer lives in a feature folder.
 *
 * Registration, the waiting worker and the apply-update action belong to `src/pwa/`
 * (architecture §4, §8) and are driven by the app root on launch, so a fresh install is
 * offline-covered without the owner ever opening this tab. Keeping the implementation
 * here meant the opposite: no `sw.js` until Perfil was visited, and a first offline cold
 * start that could not work (S3).
 *
 * This file stays as the seam and nothing else. `src/features/profile/useProfileData.ts`
 * imports these names from here, and a feature may not import `src/pwa` (§4), so the
 * composition root (`src/app/providers.tsx`) hands the app's one watch over. Everything
 * below resolves to that same instance: the root registers it, Perfil subscribes to it,
 * and `applyUpdate` is the one `SKIP_WAITING` — never sent automatically.
 */

export {
  createServiceWorkerWatch,
  serviceWorkerUrl,
  type UpdateRuntime,
  type UpdateWatch,
} from '../../app/providers';
