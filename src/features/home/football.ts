/**
 * Recording a football match by hand — specs S1 and S6.
 *
 * The match is an **`ActivityRecord`, never a `WorkoutSession`**. Nothing in this file
 * touches `storage.sessions`, so the rotation cannot see it: `homeViewOf` builds the next
 * strength day with `nextPlanDay(plan, recent sessions)`, and `recent` never learns a
 * match happened. That is the whole mechanism behind "el fútbol no modifica la rotación",
 * and it is a consequence of the write, not of a guard.
 *
 * What the record says, and what it refuses to say:
 *
 * - `kind: 'other'` — football is neither a lift nor a cardio sample with a distance.
 * - `durationSeconds: 3000` — the owner's own number (two halves of 25). It is typed by
 *   the app, not measured, but it is the number the owner gave, so it is stored as given.
 * - `activeEnergyKcal: null` — **no health data is invented**. Rupfit has no reading to
 *   put there, and `null` is how §1 rule 6 says "not known".
 * - `provenance: 'manual'` — the owner recorded it, so the screen says so. This is the
 *   only provenance value the app itself writes.
 * - `externalSampleId: null` — the port's dedupe key (I-11) belongs to imports; a manual
 *   row is not in that index, so it can never collide with an imported sample, and
 *   `ActivityRepository.save` skips the clash check for it.
 * - `date: startOfDay(now)` — the day the match is reported for. The app never tracked
 *   when it started, so it does not claim a time of day either.
 */

import { useCallback, useRef, useState } from 'react';
import type { ActivityRecord, EpochMs, StoragePort } from '../../storage';
import { createIdFactory } from '../session/startSession';
import type { IdFactory } from '../session/start';
import type { Clock } from '../session/controller';
import { startOfDay } from './selectors';

/** Two halves of 25 minutes: the owner's football session, in seconds. */
export const FOOTBALL_DURATION_SECONDS = 50 * 60;

/** The minutes the card states, so the copy and the payload cannot drift apart. */
export const FOOTBALL_DURATION_MINUTES = FOOTBALL_DURATION_SECONDS / 60;

/** The row the capture writes. Pure, so a test can read the payload without a store. */
export function footballRecordOf(now: EpochMs, id: string): ActivityRecord {
  return {
    id,
    date: startOfDay(now),
    kind: 'other',
    durationSeconds: FOOTBALL_DURATION_SECONDS,
    activeEnergyKcal: null,
    provenance: 'manual',
    externalSampleId: null,
  };
}

export interface FootballWriteDeps {
  readonly storage: StoragePort;
  readonly clock: Clock;
  /** Injected so a test can pin ids; the app uses `createIdFactory()`. */
  readonly newId?: IdFactory | undefined;
}

export interface FootballDeps extends FootballWriteDeps {
  /** Called after a successful write, so the screen can re-read its own rows. */
  readonly onSaved?: (() => void) | undefined;
}

export type FootballOutcome = 'saved' | 'failed';

/** Writes one manual activity row. It never creates a session and never navigates. */
export async function recordFootball(deps: FootballWriteDeps): Promise<FootballOutcome> {
  const newId = deps.newId ?? createIdFactory();
  try {
    await deps.storage.activities.save(footballRecordOf(deps.clock.now(), newId()));
    return 'saved';
  } catch {
    return 'failed';
  }
}

export const FOOTBALL_COPY = {
  saved: `Fútbol registrado: hoy, ${String(FOOTBALL_DURATION_MINUTES)} min.`,
  failed: 'No se pudo guardar el fútbol. Inténtalo otra vez.',
} as const;

export interface FootballCaptureState {
  /** True while the write is in flight: the button is disabled and says so. */
  readonly busy: boolean;
  /** The plain result line of the last attempt; `null` before the first one. */
  readonly notice: string | null;
  save(): void;
}

/**
 * The React seam, shaped like `useStartSession`: a ref is the guard (two taps in the same
 * tick both read the old state), and the state is only there to disable the button.
 */
export function useFootballCapture(deps: FootballDeps): FootballCaptureState {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  const { storage, clock, newId, onSaved } = deps;

  const save = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    void recordFootball({ storage, clock, newId }).then((outcome) => {
      inFlight.current = false;
      setBusy(false);
      setNotice(outcome === 'saved' ? FOOTBALL_COPY.saved : FOOTBALL_COPY.failed);
      if (outcome === 'saved') onSaved?.();
    });
  }, [storage, clock, newId, onSaved]);

  return { busy, notice, save };
}
