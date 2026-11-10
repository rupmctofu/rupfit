/**
 * The two-step delete of a stored session (odd/tasks/home-hierarchy.md T4, S5; L3):
 * a bin makes a question, the question makes the write.
 *
 * The screens cannot be mounted here (vitest runs in `node`, there is no DOM package in
 * the project), so these tests pin the behaviour the screens must not decide on their
 * own: one tap writes nothing, a cancel writes nothing, a failure keeps the session, and
 * the store is always called flag-then-delete with the confirmation the repository
 * verifies.
 */
import { describe, expect, it } from 'vitest';
import { deleteSessionConfirmation, type Uuid, type WorkoutSession } from '../../storage';
import {
  DELETE_FLOW_IDLE,
  deleteStoredSession,
  isAsking,
  isFailed,
  reduceDeleteFlow,
  runDelete,
  type DeleteFlow,
  type SessionDeletePort,
} from './deleteFlow';
import { at, session } from './fixtures';

const DAY = 'Sentadilla / Pierna';

function stored(): WorkoutSession {
  return session({ id: 'session-a', dayName: DAY, scheduledDate: at(2024, 10, 9, 18) });
}

/** A port that records every call, in order, and can fail on demand. */
function recordingPort(options: { readonly failOn?: 'mark' | 'delete' } = {}): {
  readonly calls: readonly string[];
  readonly port: SessionDeletePort;
} {
  const calls: string[] = [];
  const port: SessionDeletePort = {
    markDeletionPending: async (id: Uuid) => {
      calls.push(`mark:${id}`);
      if (options.failOn === 'mark') throw new Error('sin conexión');
    },
    delete: async (id: Uuid) => {
      calls.push(`delete:${id}`);
      if (options.failOn === 'delete') throw new Error('sin conexión');
    },
  };
  return { calls, port };
}

describe('the delete question is a second step', () => {
  it('starts with no question open, and the first tap only asks', () => {
    const asking = reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'ask', sessionId: 'session-a' });
    expect(asking).toEqual({ step: 'confirming', sessionId: 'session-a' });
    // The bin is not a delete: the flow has not reached the only step that writes.
    expect(asking.step).not.toBe('deleting');
    expect(isAsking(asking, 'session-a')).toBe(true);
  });

  it('opens the question on exactly the row that was tapped, and on no other', () => {
    const asking = reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'ask', sessionId: 'session-a' });
    expect(isAsking(asking, 'session-b')).toBe(false);
    expect(isFailed(asking, 'session-a')).toBe(false);
  });

  it('goes from the question to the write only on the second tap', () => {
    const asking = reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'ask', sessionId: 'session-a' });
    const deleting = reduceDeleteFlow(asking, { type: 'confirm' });
    expect(deleting).toEqual({ step: 'deleting', sessionId: 'session-a' });
    // Confirming a question that is not open is not a delete.
    expect(reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'confirm' })).toEqual(DELETE_FLOW_IDLE);
    expect(reduceDeleteFlow(deleting, { type: 'confirm' })).toEqual(deleting);
  });

  it('lets the owner retry the same question after a failure, with a second tap', () => {
    const failed: DeleteFlow = { step: 'failed', sessionId: 'session-a' };
    expect(reduceDeleteFlow(failed, { type: 'confirm' })).toEqual({
      step: 'deleting',
      sessionId: 'session-a',
    });
  });

  it('cancels the question and leaves nothing open, from asking or from a failure', () => {
    const asking = reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'ask', sessionId: 'session-a' });
    expect(reduceDeleteFlow(asking, { type: 'cancel' })).toEqual(DELETE_FLOW_IDLE);
    expect(reduceDeleteFlow({ step: 'failed', sessionId: 'session-a' }, { type: 'cancel' })).toEqual(
      DELETE_FLOW_IDLE,
    );
  });

  it('does not let Escape abandon a write that is already in flight', () => {
    const deleting: DeleteFlow = { step: 'deleting', sessionId: 'session-a' };
    expect(reduceDeleteFlow(deleting, { type: 'cancel' })).toEqual(deleting);
    expect(reduceDeleteFlow(deleting, { type: 'ask', sessionId: 'session-b' })).toEqual(deleting);
  });

  it('returns to rest when the store says the session is gone', () => {
    expect(reduceDeleteFlow({ step: 'deleting', sessionId: 'session-a' }, { type: 'deleted' })).toEqual(
      DELETE_FLOW_IDLE,
    );
  });

  it('keeps the question open on the session whose delete failed', () => {
    const failed = reduceDeleteFlow({ step: 'deleting', sessionId: 'session-a' }, { type: 'failed' });
    expect(failed).toEqual({ step: 'failed', sessionId: 'session-a' });
    expect(isFailed(failed, 'session-a')).toBe(true);
    expect(isAsking(failed, 'session-a')).toBe(false);
  });
});

describe('a cancelled question writes nothing', () => {
  it('never reaches the store when the owner cancels', async () => {
    const session = stored();
    let calls = 0;
    const remove = async (): Promise<void> => {
      calls += 1;
    };
    const asking = reduceDeleteFlow(DELETE_FLOW_IDLE, { type: 'ask', sessionId: session.id });
    const cancelled = reduceDeleteFlow(asking, { type: 'cancel' });

    const afterCancel = await runDelete({ flow: cancelled, session, remove });

    expect(calls).toBe(0);
    expect(afterCancel).toEqual(DELETE_FLOW_IDLE);
  });

  it('refuses to delete a session the question is not about', async () => {
    const session = stored();
    const asked = { step: 'confirming', sessionId: 'session-b' } as const;
    let calls = 0;
    const remove = async (): Promise<void> => {
      calls += 1;
    };

    expect(await runDelete({ flow: asked, session, remove })).toEqual(asked);
    expect(calls).toBe(0);
  });
});

describe('a failure keeps the session', () => {
  it('says so, calls the store once, and leaves the session in place', async () => {
    const session = stored();
    const remaining = new Map<string, WorkoutSession>([[session.id, session]]);
    const remove = async (target: WorkoutSession): Promise<void> => {
      if (target.id === session.id) throw new Error('sin conexión');
      remaining.delete(target.id);
    };
    const flow: DeleteFlow = { step: 'confirming', sessionId: session.id };

    const after = await runDelete({ flow, session, remove });

    expect(after).toEqual({ step: 'failed', sessionId: session.id });
    expect(remaining.has(session.id)).toBe(true);
  });

  it('keeps the question available for a retry, and a retry succeeds', async () => {
    const session = stored();
    let attempt = 0;
    const remove = async (): Promise<void> => {
      attempt += 1;
      if (attempt === 1) throw new Error('sin conexión');
    };
    const flow: DeleteFlow = { step: 'confirming', sessionId: session.id };

    const failed = await runDelete({ flow, session, remove });
    const retried = await runDelete({ flow: { step: 'confirming', sessionId: session.id }, session, remove });

    expect(failed.step).toBe('failed');
    expect(retried).toEqual(DELETE_FLOW_IDLE);
    expect(attempt).toBe(2);
  });

  it('returns to the list only after the write resolved', async () => {
    const session = stored();
    const flow: DeleteFlow = { step: 'confirming', sessionId: session.id };
    const after = await runDelete({ flow, session, remove: async () => undefined });
    expect(after).toEqual(DELETE_FLOW_IDLE);
  });
});

describe('the store is called flag-then-delete, with the confirmation it verifies', () => {
  it('marks first and deletes second, with the day-named sentence', async () => {
    const session = stored();
    const { calls, port } = recordingPort();

    await deleteStoredSession(port, session);

    expect(calls).toEqual([`mark:${session.id}`, `delete:${session.id}`]);
  });

  it('sends the confirmation the repository checks, derived from the session itself', async () => {
    const session = stored();
    const confirmations: string[] = [];
    const port: SessionDeletePort = {
      markDeletionPending: async () => undefined,
      delete: async (_id, input) => {
        confirmations.push(input.confirmation);
      },
    };

    await deleteStoredSession(port, session);

    expect(confirmations).toEqual([deleteSessionConfirmation(DAY)]);
    expect(confirmations[0]).toBe('BORRAR Sentadilla / Pierna');
  });

  it('never reaches the delete when the flag fails, so nothing is half-removed', async () => {
    const session = stored();
    const { calls, port } = recordingPort({ failOn: 'mark' });

    await expect(deleteStoredSession(port, session)).rejects.toThrow('sin conexión');
    expect(calls).toEqual([`mark:${session.id}`]);
  });
});
