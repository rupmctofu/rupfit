/**
 * The football capture payload and its write, without React.
 *
 * Three things are worth pinning here, because they are the difference between a manual
 * activity and a session:
 *
 * 1. The record says only what the owner stated: today, 50 minutes, `other`, `manual`,
 *    no kcal and no import key. No health datum is invented.
 * 2. `recordFootball` writes through `activities.save` and nothing else — it never
 *    creates a `WorkoutSession`, which is what leaves the rotation alone (S6).
 * 3. A failed write is reported as a sentence, not thrown at the screen.
 */

import { describe, expect, it } from 'vitest';
import type { ActivityRecord, StoragePort } from '../../storage';
import { createFakeStorage } from '../session/fake-port';
import {
  FOOTBALL_DURATION_SECONDS,
  footballRecordOf,
  recordFootball,
} from './football';
import { startOfDay } from './selectors';

/** Wednesday 8 November 2023, 18:00 local: a Thursday match reported the day before. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();

describe('footballRecordOf', () => {
  it('records an other/manual activity of 50 minutes, with no health datum', () => {
    expect(footballRecordOf(NOW, 'football-1')).toEqual({
      id: 'football-1',
      date: startOfDay(NOW),
      kind: 'other',
      durationSeconds: 3000,
      activeEnergyKcal: null,
      provenance: 'manual',
      // The port's dedupe key belongs to imports (I-11); a manual row stays out of it.
      externalSampleId: null,
    });
  });

  it('keeps the two halves of 25 in one duration', () => {
    expect(FOOTBALL_DURATION_SECONDS).toBe(2 * 25 * 60);
  });
});

/** A port whose activity write is the only thing that can happen. */
function portWithSave(save: (activity: ActivityRecord) => Promise<void>): {
  readonly storage: StoragePort;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const base = createFakeStorage();
  return {
    calls,
    storage: {
      ...base,
      activities: {
        all: () => Promise.resolve([]),
        between: () => Promise.resolve([]),
        save: (activity) => {
          calls.push('activities.save');
          return save(activity);
        },
        remove: () => Promise.reject(new Error('not offered')),
      },
      sessions: {
        ...base.sessions,
        create: () => {
          calls.push('sessions.create');
          return Promise.reject(new Error('a match is not a session'));
        },
      },
    },
  };
}

describe('recordFootball', () => {
  it('saves one activity and creates no session', async () => {
    const saved: ActivityRecord[] = [];
    const { storage, calls } = portWithSave((activity) => {
      saved.push(activity);
      return Promise.resolve();
    });

    const outcome = await recordFootball({
      storage,
      clock: { now: () => NOW },
      newId: () => 'football-1',
    });

    expect(outcome).toBe('saved');
    expect(calls).toEqual(['activities.save']);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.durationSeconds).toBe(3000);
    expect(saved[0]?.provenance).toBe('manual');
  });

  it('reports a refused write instead of throwing at the screen', async () => {
    const { storage } = portWithSave(() => Promise.reject(new Error('quota')));
    const outcome = await recordFootball({
      storage,
      clock: { now: () => NOW },
      newId: () => 'football-1',
    });

    expect(outcome).toBe('failed');
  });
});
