/**
 * Recording a football match by hand — specs S1 and S6.
 *
 * The match is an **`ActivityRecord`, never a `WorkoutSession`**. Nothing in this file
 * touches `storage.sessions`, so the rotation cannot see it: `homeViewOf` builds the next
 * strength day with `nextPlanDay(plan, recent sessions)`, and `recent` never learns a
 * match happened. That is the whole mechanism behind "el fútbol no modifica la rotación",
 * and it is a consequence of the write, not of a guard.
 *
 * **Two writes, one row.** `recordFootball` is the loose capture of the Actividad row;
 * `reportMatch` is T8's report on the day the week calls the match, guarded so the day is
 * informed once. Both write the same shape, so the week can read either one as the match
 * of its day (`reportedMatchOf` in `features/week/week.ts`) without a new entity, a new
 * table or a stored flag.
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
import { reportedMatchOf } from '../week/week';
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
  /**
   * T8 (S1) — report the match of the day instead of adding a loose football row. The
   * write is the guarded one (`reportMatch`), so the day can never be reported twice.
   */
  readonly match?: boolean | undefined;
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

/** `already`: the match of that day was reported before, so nothing was written. */
export type MatchOutcome = FootballOutcome | 'already';

/**
 * T8 (S1) — the match of the day, reported once, with the same row the capture writes.
 *
 * The match is not an entity and has no flag anywhere: the football row of that date *is*
 * its memory, which is why nothing here writes a session, a record or a table (T8). A
 * second attempt reads the store back, finds the day reported and returns `already`
 * without a second row — a reload, a second tab or a re-read cannot double-write it.
 *
 * The day is the clock's own local day, the date `footballRecordOf` stamps: the report is
 * only offered on the day the week calls the match, and on that day they are the same day.
 */
export async function reportMatch(deps: FootballWriteDeps): Promise<MatchOutcome> {
  const newId = deps.newId ?? createIdFactory();
  const now = deps.clock.now();
  try {
    if (reportedMatchOf(await deps.storage.activities.all(), now)) return 'already';
    await deps.storage.activities.save(footballRecordOf(now, newId()));
    return 'saved';
  } catch {
    return 'failed';
  }
}

export const FOOTBALL_COPY = {
  saved: `Fútbol registrado: hoy, ${String(FOOTBALL_DURATION_MINUTES)} min.`,
  failed: 'No se pudo guardar el fútbol. Inténtalo otra vez.',
} as const;

/**
 * What the last attempt says. A reported match adds no line: the day's own card already
 * says it is done, read from the week (S1), and two sentences for one fact is one too many.
 */
function noticeOf(outcome: MatchOutcome, match: boolean): string | null {
  if (outcome === 'failed') return FOOTBALL_COPY.failed;
  return match ? null : FOOTBALL_COPY.saved;
}

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

  const { storage, clock, newId, onSaved, match } = deps;

  const save = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    const write =
      match === true
        ? reportMatch({ storage, clock, newId })
        : recordFootball({ storage, clock, newId });
    void write.then((outcome) => {
      inFlight.current = false;
      setBusy(false);
      setNotice(noticeOf(outcome, match === true));
      // `already` is a day reported in another tab or an earlier attempt: the re-read is
      // what shows it, so it counts as a write the screen has to catch up with.
      if (outcome !== 'failed') onSaved?.();
    });
  }, [storage, clock, newId, onSaved, match]);

  return { busy, notice, save };
}
