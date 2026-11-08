/**
 * The clock, structurally.
 *
 * `src/app/providers.tsx` provides the one clock the app has (`systemClock`, or an
 * injected one in a test or the demo). Perfil declares the shape it needs instead of
 * importing another feature folder, which architecture §4 forbids: a feature may not
 * import a feature.
 */

import type { EpochMs } from '../../storage';

export interface Clock {
  now(): EpochMs;
}
