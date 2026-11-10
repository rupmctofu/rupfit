/**
 * Deleting a stored session — the two steps the screen asks for
 * (odd/tasks/home-hierarchy.md T4, S5; log L3).
 *
 * The storage invariant does not move: a session is flagged in one committed step
 * (`markDeletionPending`) and removed in the next, and only when the confirmation is
 * `deleteSessionConfirmation(dayNameSnapshot)` (I-5). What changes is who supplies the
 * sentence: the owner no longer types it, so the screen asks «¿Eliminar esta sesión?»
 * with `Sí, eliminar` / `Cancelar`, and only a second tap reaches the store.
 *
 * This module owns the two things the screen cannot own honestly in a render function:
 *
 * 1. **the flow** — a reducer over `idle → confirming → deleting → idle | failed`, so
 *    "one tap never writes" is a state, not a promise in a click handler;
 * 2. **the write** — `deleteStoredSession` calls the port in the one order the repository
 *    accepts, and `runDelete` is the only door into it: handed a flow that is not asking
 *    about this very session, it writes nothing at all.
 *
 * The project has no DOM tests (vitest runs in `node`), so the behaviour that matters is
 * decided here, in plain functions, and the components only render their result.
 */
import { deleteSessionConfirmation } from '../../storage';
import type { Uuid, WorkoutSession } from '../../storage';

export type DeleteStep = 'idle' | 'confirming' | 'deleting' | 'failed';

export interface DeleteFlow {
  readonly step: DeleteStep;
  /** The session the question is about; `null` when nothing is being asked. */
  readonly sessionId: Uuid | null;
}

/** What the screen starts in: no question, no write, nothing to undo. */
export const DELETE_FLOW_IDLE: DeleteFlow = { step: 'idle', sessionId: null };

export type DeleteFlowEvent =
  /** The bin of one row: it asks, it does not write. */
  | { readonly type: 'ask'; readonly sessionId: Uuid }
  /** `Sí, eliminar`: the only event that lets a write start. */
  | { readonly type: 'confirm' }
  /** `Cancelar` or Escape. */
  | { readonly type: 'cancel' }
  | { readonly type: 'deleted' }
  | { readonly type: 'failed' };

/**
 * One tap is never enough: `ask` only opens the question, and nothing moves while a
 * write is in flight — not the question, not the cancel. A session cannot be deleted by
 * holding down a key either: `confirm` only counts on the question of one session, and
 * never from `idle`.
 */
export function reduceDeleteFlow(flow: DeleteFlow, event: DeleteFlowEvent): DeleteFlow {
  switch (event.type) {
    case 'ask':
      if (flow.step === 'deleting') return flow;
      return { step: 'confirming', sessionId: event.sessionId };
    case 'confirm':
      // `failed` accepts a second tap: the question stayed open with its message, and
      // retrying is the same gesture as the first attempt, not a new decision.
      return flow.step === 'confirming' || flow.step === 'failed'
        ? { step: 'deleting', sessionId: flow.sessionId }
        : flow;
    case 'cancel':
      return flow.step === 'deleting' ? flow : DELETE_FLOW_IDLE;
    case 'deleted':
      return DELETE_FLOW_IDLE;
    case 'failed':
      return flow.step === 'deleting' ? { step: 'failed', sessionId: flow.sessionId } : flow;
  }
}

/** Is the question open for this session? Rows ask this to decide what they render. */
export function isAsking(flow: DeleteFlow, sessionId: Uuid): boolean {
  return (flow.step === 'confirming' || flow.step === 'deleting') && flow.sessionId === sessionId;
}

/** The session whose delete failed, so its row can keep the message under the question. */
export function isFailed(flow: DeleteFlow, sessionId: Uuid): boolean {
  return flow.step === 'failed' && flow.sessionId === sessionId;
}

/**
 * The two port calls the repository demands, in the only order it accepts (I-5). The
 * confirmation is derived here, from the session itself, so no screen can hand over a
 * sentence that does not match the row it is deleting.
 */
export interface SessionDeletePort {
  readonly markDeletionPending: (id: Uuid) => Promise<void>;
  readonly delete: (id: Uuid, input: { readonly confirmation: string }) => Promise<void>;
}

export async function deleteStoredSession(
  port: SessionDeletePort,
  session: Pick<WorkoutSession, 'id' | 'dayNameSnapshot'>,
): Promise<void> {
  await port.markDeletionPending(session.id);
  await port.delete(session.id, {
    confirmation: deleteSessionConfirmation(session.dayNameSnapshot),
  });
}

export interface RunDeleteInput {
  readonly flow: DeleteFlow;
  readonly session: WorkoutSession;
  /** The screen's own remove: the store for real, a recorder in the tests. */
  readonly remove: (session: WorkoutSession) => Promise<void>;
}

/**
 * The only door into the write. A cancel leaves the flow at `idle`, and `idle` never
 * reaches `remove`: cancelling is silence, not a write that is rolled back. A failure
 * resolves to `failed` instead of throwing, so the row stays on screen with its message
 * and the session stays in the store.
 */
export async function runDelete({ flow, session, remove }: RunDeleteInput): Promise<DeleteFlow> {
  if (flow.step !== 'confirming' || flow.sessionId !== session.id) return flow;
  try {
    await remove(session);
    return DELETE_FLOW_IDLE;
  } catch {
    return { step: 'failed', sessionId: session.id };
  }
}
