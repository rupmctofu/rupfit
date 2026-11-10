/**
 * Deleting a recorded activity, and the confirmation that guards it — without React.
 *
 * Two things are worth pinning here, because they are the owner's own words (S5):
 *
 * 1. **The bin asks, it never deletes.** `deletionReducer` has exactly one event that
 *    starts a removal (`start`) and it is ignored unless a question is open. There is no
 *    event that removes a row, and no `window.confirm` anywhere: the yes is a button.
 * 2. **The port does the deleting.** `deleteActivity` goes through
 *    `activities.remove` and nothing else — no session is touched, so the rotation
 *    cannot move because a match was deleted (S6).
 */

import { describe, expect, it } from 'vitest';
import type { ActivityRecord, StoragePort } from '../../storage';
import { createFakeStorage } from '../session/fake-port';
import {
  ACTIVITY_DELETE_COPY,
  NO_DELETION,
  deleteActivity,
  deletionReducer,
  type DeletionState,
} from './deletion';

/** Wednesday 8 November 2023, 18:00 local. */
const NOW = new Date(2023, 10, 8, 18, 0, 0).getTime();

const FOOTBALL: ActivityRecord = {
  id: 'football-1',
  date: NOW,
  kind: 'other',
  durationSeconds: 50 * 60,
  activeEnergyKcal: null,
  provenance: 'manual',
  externalSampleId: null,
};

/** A port whose activity list is real: a removal takes the row out of `all()`. */
function portWithActivities(rows: readonly ActivityRecord[]): {
  readonly storage: StoragePort;
  readonly rows: ActivityRecord[];
  readonly calls: string[];
} {
  const stored = [...rows];
  const calls: string[] = [];
  const base = createFakeStorage();
  return {
    rows: stored,
    calls,
    storage: {
      ...base,
      activities: {
        all: () => Promise.resolve([...stored]),
        between: () => Promise.resolve([...stored]),
        save: (activity) => {
          calls.push('activities.save');
          stored.push(activity);
          return Promise.resolve();
        },
        remove: (id) => {
          calls.push('activities.remove');
          const index = stored.findIndex((row) => row.id === id);
          if (index < 0) return Promise.reject(new Error(`no activity ${id}`));
          stored.splice(index, 1);
          return Promise.resolve();
        },
      },
    },
  };
}

describe('deleteActivity', () => {
  it('removes the row through the activities port and says so', async () => {
    const { storage, rows, calls } = portWithActivities([FOOTBALL]);

    const outcome = await deleteActivity(storage, 'football-1');

    expect(outcome).toBe('deleted');
    expect(calls).toEqual(['activities.remove']);
    expect(rows).toHaveLength(0);
    expect(await storage.activities.all()).toEqual([]);
  });

  it('reports a refused removal instead of throwing at the screen', async () => {
    const { storage } = portWithActivities([]);

    expect(await deleteActivity(storage, 'missing')).toBe('failed');
  });
});

describe('deletionReducer', () => {
  it('asks first: the bin alone removes nothing', () => {
    const asked = deletionReducer(NO_DELETION, { type: 'ask', id: 'football-1' });

    expect(asked.pendingId).toBe('football-1');
    // No request in flight and no result: a single tap only asks the question.
    expect(asked.busy).toBe(false);
    expect(asked.notice).toBeNull();
  });

  it('ignores the yes when there is no open question', () => {
    const idle: DeletionState = { pendingId: null, busy: false, notice: null };

    expect(deletionReducer(idle, { type: 'start' })).toBe(idle);
    // A yes for another row is not a yes for this one.
    const asked = deletionReducer(idle, { type: 'ask', id: 'football-1' });
    expect(deletionReducer(asked, { type: 'start' })).toEqual({ ...asked, busy: true });
  });

  it('closes the question without removing anything on cancel', () => {
    const asked = deletionReducer(NO_DELETION, { type: 'ask', id: 'football-1' });

    expect(deletionReducer(asked, { type: 'cancel' })).toEqual(NO_DELETION);
  });

  it('reports the result of the removal and forgets which row was asked about', () => {
    const busy = deletionReducer(deletionReducer(NO_DELETION, { type: 'ask', id: 'football-1' }), {
      type: 'start',
    });

    const deleted = deletionReducer(busy, { type: 'settle', ok: true });
    expect(deleted).toEqual({ pendingId: null, busy: false, notice: ACTIVITY_DELETE_COPY.deleted });

    const failed = deletionReducer(busy, { type: 'settle', ok: false });
    expect(failed.notice).toBe(ACTIVITY_DELETE_COPY.failed);
    expect(failed.pendingId).toBeNull();
  });
});

describe('the whole deletion path', () => {
  it('removes the row only after the question has been answered', async () => {
    const { storage, rows, calls } = portWithActivities([FOOTBALL]);

    // First tap: the bin asks.
    let state = deletionReducer(NO_DELETION, { type: 'ask', id: 'football-1' });
    expect(state.pendingId).toBe('football-1');
    expect(rows).toHaveLength(1);
    expect(calls).toEqual([]);

    // Second tap: «Sí», and only then does the port see a removal.
    state = deletionReducer(state, { type: 'start' });
    expect(state.busy).toBe(true);
    const outcome = await deleteActivity(storage, 'football-1');
    state = deletionReducer(state, { type: 'settle', ok: outcome === 'deleted' });

    expect(calls).toEqual(['activities.remove']);
    expect(rows).toHaveLength(0);
    expect(state.pendingId).toBeNull();
    expect(state.notice).toBe(ACTIVITY_DELETE_COPY.deleted);
  });

  it('keeps the row when the question is cancelled', async () => {
    const { storage, rows, calls } = portWithActivities([FOOTBALL]);

    const asked = deletionReducer(NO_DELETION, { type: 'ask', id: 'football-1' });
    const cancelled = deletionReducer(asked, { type: 'cancel' });

    expect(cancelled.pendingId).toBeNull();
    expect(calls).toEqual([]);
    expect(await storage.activities.all()).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });
});
