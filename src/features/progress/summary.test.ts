/**
 * The session read-out of Historial — the Resumen numbers, not a second copy of them.
 *
 * `src/core/session/model.ts` already owns `summarise`; this module only adapts a
 * stored `WorkoutSession` into the state that function takes, and decides which
 * stored sessions are history.
 */

import { describe, expect, it } from 'vitest';
import { EFFORT } from '../../core/domain';
import { at, exerciseSession, session, set, SQUAT } from './fixtures';
import { historySessions, sessionSummary } from './summary';

function completed(): ReturnType<typeof session> {
  return session({
    id: 'session-a',
    scheduledDate: at(2024, 10, 4, 18),
    startedAt: at(2024, 10, 4, 18),
    endedAt: at(2024, 10, 4, 18, 52),
    exercises: [
      exerciseSession({
        sets: [
          set({ weightKg: 100, actualReps: 6, effort: EFFORT.correct, confirmedAt: at(2024, 10, 4, 18, 5), index: 1 }),
          set({ weightKg: 100, actualReps: 6, effort: EFFORT.correct, confirmedAt: at(2024, 10, 4, 18, 9), index: 2 }),
          set({ weightKg: 95, actualReps: 8, effort: EFFORT.hard, confirmedAt: at(2024, 10, 4, 18, 14), index: 3 }),
        ],
      }),
    ],
  });
}

describe('a stored session as the read-out', () => {
  it('keeps every number of the Resumen: sets, volume and duration (§8)', () => {
    const summary = sessionSummary(completed());
    expect(summary.setsConfirmed).toBe(3);
    expect(summary.setsPrescribed).toBe(3);
    expect(summary.volumeKg).toBe(100 * 6 + 100 * 6 + 95 * 8);
    expect(summary.durationMs).toBe(52 * 60_000);
    expect(summary.exercises[0]?.name).toBe(SQUAT.name);
    expect(summary.exercises[0]?.bestWeightKg).toBe(100);
  });

  it('leaves the duration open for a session that never ended', () => {
    const open = session({
      scheduledDate: at(2024, 10, 4, 18),
      startedAt: at(2024, 10, 4, 18),
      endedAt: null,
      status: 'inProgress',
    });
    expect(sessionSummary(open).durationMs).toBeNull();
  });
});

describe('what counts as history', () => {
  it('keeps finished sessions with evidence, newest first', () => {
    const older = session({
      id: 'older',
      scheduledDate: at(2024, 9, 28, 18),
      exercises: [exerciseSession({ sets: [set({ weightKg: 90, actualReps: 8, confirmedAt: at(2024, 9, 28, 18) })] })],
    });
    const newer = completed();
    const rows = historySessions([newer, older]);
    expect(rows.map((row) => row.id)).toEqual(['session-a', 'older']);
  });

  it('drops a scheduled session and one that finished without a single set', () => {
    const scheduled = session({ scheduledDate: at(2024, 10, 7), status: 'scheduled', startedAt: null, endedAt: null });
    const empty = session({ scheduledDate: at(2024, 10, 3), status: 'abandoned', exercises: [exerciseSession()] });
    const running = session({ scheduledDate: at(2024, 10, 4), status: 'inProgress', endedAt: null });
    expect(historySessions([scheduled, empty, running])).toHaveLength(0);
  });

  it('keeps a partial session: stopping early is a decision, not a failure', () => {
    const partial = session({
      id: 'partial',
      scheduledDate: at(2024, 10, 2, 18),
      status: 'partial',
      exercises: [exerciseSession({ sets: [set({ weightKg: 80, actualReps: 6, confirmedAt: at(2024, 10, 2, 18) })] })],
    });
    expect(historySessions([partial]).map((row) => row.status)).toEqual(['partial']);
  });
});
