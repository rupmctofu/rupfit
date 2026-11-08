/**
 * The weigh-in write, in the order it has to happen (S3, S6, I-10).
 *
 * `weightEntry.ts` decides; this file performs. Four steps, and the order is the point:
 *
 * 1. **Validate** the draft against the injected clock, so a malformed day or a weight
 *    outside the range never reaches the store.
 * 2. **Read the day** through `by_date`, so the write corrects the row the day already
 *    has instead of adding a second one.
 * 3. **Save once.** A single `put` in a single transaction: there is no delete-then-insert
 *    pair that could half-succeed into a day with no weigh-in at all.
 * 4. **Report what the store now says**, from the row that was written merged into the
 *    list that was read — no second read, and the same list the screen then displays.
 *
 * A failed read or write writes nothing and returns a sentence; the form keeps the draft
 * and offers a retry. Nothing here reads `Date.now()`: the clock arrives as `now()`.
 */

import type { BodyMeasurement, StoragePort } from '../../storage';
import {
  checkWeightDraft,
  planWeightWrite,
  weightNotice,
  withPlannedWrite,
  type IdFactory,
  type WeightDraft,
  type WeightSaveOutcome,
} from './weightEntry';
import { startOfDay, weightSeries } from './aggregates';

export interface WeightSaveDeps {
  readonly storage: StoragePort;
  /** The provider's clock, passed as a function because this runs outside render. */
  readonly now: () => number;
  /** Injected so a test can pin ids; the app uses `createMeasurementId()`. */
  readonly newId: IdFactory;
}

export const WEIGHT_SAVE_COPY = {
  readFailed: 'No se pudo leer lo que hay guardado del peso. Lo guardado sigue ahí: reintenta.',
  saveFailed: 'No se pudo guardar el pesaje. Lo que había guardado sigue como estaba: reintenta.',
} as const;

let fallbackIds = 0;

/**
 * A measurement id. `crypto.randomUUID()` when the context is secure (GitHub Pages is),
 * and a local fallback otherwise — the same seam and the same compromise
 * `session/startSession.ts` makes, kept here so `progress` does not import a session
 * module for one string.
 */
export function createMeasurementId(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID !== undefined) return webCrypto.randomUUID();
  fallbackIds += 1;
  return `measurement-${fallbackIds.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveWeightEntry(
  deps: WeightSaveDeps,
  draft: WeightDraft,
): Promise<WeightSaveOutcome> {
  const now = deps.now();
  const checked = checkWeightDraft(draft, now);
  if (!checked.ok) {
    return { kind: 'invalid', field: checked.field, message: checked.message };
  }

  let measurements: readonly BodyMeasurement[];
  try {
    measurements = await deps.storage.measurements.all();
  } catch {
    return { kind: 'failed', message: WEIGHT_SAVE_COPY.readFailed };
  }

  const planned = planWeightWrite({
    now,
    day: checked.day,
    weightKg: checked.weightKg,
    // The whole list is already read; the day's rows are the ones that share its start.
    sameDay: measurements.filter((row) => startOfDay(row.date) === checked.day),
    newId: deps.newId,
  });

  try {
    await deps.storage.measurements.save(planned.measurement);
  } catch {
    return { kind: 'failed', message: WEIGHT_SAVE_COPY.saveFailed };
  }

  const after = withPlannedWrite(measurements, planned);
  return {
    kind: 'saved',
    measurements: after,
    notice: weightNotice(weightSeries(after, now), checked.day, checked.weightKg),
  };
}
