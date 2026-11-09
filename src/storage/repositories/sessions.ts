/**
 * Sessions repository — the write paths of docs/data-model.md §5.4 and the session
 * state machine of §7. Every guard runs *inside* the transaction that writes, and
 * every write resolves on `complete` (§5.4, I-12).
 */

import type { IDBPTransaction } from 'idb';
import { deleteSessionConfirmation, SET_INDEX_START } from '../constants';
import { atLeastKeyRange, prefixKeyRange, type Database } from '../db';
import { StorageError } from '../errors';
import type { ExerciseSession, SessionStatus, SetRecord, Uuid, WorkoutSession } from '../entities';
import { exerciseSessionFromRow, exerciseSessionToRow, isTombstone, sessionToRow, setToRow } from '../mappers';
import { loadSession } from '../readers';
import type { ExerciseSessionRow, RupfitDb, SessionRow, StoreName } from '../records';
import { deleteStamped, writeStamped, type RowSyncDeps } from '../sync';
import type {
  DeleteSessionInput,
  ExerciseSessionState,
  LoadDecisionInput,
  LoadDecisionRecord,
  SessionRepositoryPort,
  SessionStateChange,
  SubstituteExerciseInput,
} from '../port';

type WriteTx = IDBPTransaction<RupfitDb, StoreName[], 'readwrite'>;

/** The stores a full aggregate read touches. `sets` is a read here, never a write. */
const AGGREGATE_STORES: readonly StoreName[] = ['sessions', 'exerciseSessions', 'sets'];

/**
 * Every write also touches `meta`, where the queue keeps its pending ops
 * (odd/tasks/cloud-sync.md T3): the row and its op have to commit together, so the store
 * the op lives in has to be in the same transaction.
 */
const QUEUE_STORE: StoreName = 'meta';

const TERMINAL_STATUSES: readonly SessionStatus[] = ['completed', 'partial', 'abandoned'];

export class SessionRepository implements SessionRepositoryPort {
  constructor(
    private readonly database: Database,
    private readonly sync: RowSyncDeps,
  ) {}

  async byId(id: Uuid): Promise<WorkoutSession | undefined> {
    return this.database.read(AGGREGATE_STORES, async (tx) => {
      const session = await loadSession(tx, id);
      return session ?? undefined;
    });
  }

  async inProgress(): Promise<WorkoutSession | undefined> {
    return this.database.read(AGGREGATE_STORES, async (tx) => {
      const rows = await tx.objectStore('sessions').index('by_status').getAll('inProgress');
      const resumable = sortByDate(
        rows.filter((row) => !row.deletionPending && !isTombstone(row)),
      );
      const first = resumable[0];
      if (first === undefined) return undefined;
      return (await loadSession(tx, first.id)) ?? undefined;
    });
  }

  async nextScheduledOnOrAfter(date: number): Promise<WorkoutSession | undefined> {
    return this.database.read(AGGREGATE_STORES, async (tx) => {
      const rows = await tx
        .objectStore('sessions')
        .index('by_scheduledDate')
        .getAll(atLeastKeyRange(date));
      const scheduled = rows.filter(
        (row) => row.status === 'scheduled' && !row.deletionPending && !isTombstone(row),
      );
      const first = scheduled[0];
      if (first === undefined) return undefined;
      return (await loadSession(tx, first.id)) ?? undefined;
    });
  }

  async recent(limit: number): Promise<readonly WorkoutSession[]> {
    return this.database.read(AGGREGATE_STORES, async (tx) => {
      const rows = await tx.objectStore('sessions').index('by_scheduledDate').getAll();
      const newestFirst = sortByDate(
        rows.filter((row) => !row.deletionPending && !isTombstone(row)),
      ).reverse();
      const selected = newestFirst.slice(0, Math.max(0, limit));

      const sessions: WorkoutSession[] = [];
      for (const row of selected) {
        const session = await loadSession(tx, row.id);
        if (session !== null) sessions.push(session);
      }
      return sessions;
    });
  }

  /**
   * §7: opening the plan tomorrow must not create a session, so this writes a
   * `scheduled` row and its exercise sessions — no sets, no `inProgress`.
   */
  async create(session: WorkoutSession): Promise<WorkoutSession> {
    return this.database.write(['sessions', 'exerciseSessions', QUEUE_STORE], async (tx) => {
      const sessions = tx.objectStore('sessions');
      const existing = await sessions.get(session.id);
      if (existing !== undefined) {
        throw new StorageError('conflict', `Session ${session.id} is already stored.`, {
          sessionId: session.id,
        });
      }
      const withSets = session.exercises.filter((exerciseSession) => exerciseSession.sets.length > 0);
      if (withSets.length > 0) {
        throw new StorageError(
          'invalid',
          'Sets are written only by confirmSet, one committed transaction each.',
          { exerciseSessionIds: withSets.map((exerciseSession) => exerciseSession.id) },
        );
      }
      if (session.status === 'inProgress') {
        await assertNoOtherInProgress(tx, session.id);
      }

      await writeStamped({
        ...this.sync,
        tx,
        table: 'sessions',
        key: session.id,
        row: sessionToRow(session, false),
      });
      for (const exerciseSession of session.exercises) {
        await writeStamped({
          ...this.sync,
          tx,
          table: 'session_exercises',
          key: exerciseSession.id,
          row: exerciseSessionToRow(exerciseSession, session.id, session.scheduledDate),
        });
      }
      return session;
    });
  }

  async confirmSet(
    sessionId: Uuid,
    exerciseSessionId: Uuid,
    set: SetRecord,
  ): Promise<WorkoutSession> {
    return this.database.write(['sets', 'exerciseSessions', 'sessions', QUEUE_STORE], async (tx) => {
      const sessions = tx.objectStore('sessions');
      const exerciseSessions = tx.objectStore('exerciseSessions');
      const sets = tx.objectStore('sets');

      const sessionRow = await sessions.get(sessionId);
      if (sessionRow === undefined) {
        throw new StorageError('notFound', `Session ${sessionId} is not stored.`, { sessionId });
      }
      if (sessionRow.status !== 'scheduled' && sessionRow.status !== 'inProgress') {
        throw new StorageError(
          'invalidTransition',
          `A set cannot be confirmed on a session in status ${sessionRow.status}.`,
          { sessionId, status: sessionRow.status },
        );
      }

      const exerciseSessionRow = await exerciseSessions.get(exerciseSessionId);
      if (exerciseSessionRow === undefined || exerciseSessionRow.sessionId !== sessionId) {
        throw new StorageError(
          'notFound',
          `Exercise session ${exerciseSessionId} does not belong to session ${sessionId}.`,
          { sessionId, exerciseSessionId },
        );
      }
      if (
        exerciseSessionRow.status !== 'pending' &&
        exerciseSessionRow.status !== 'active'
      ) {
        throw new StorageError(
          'invalidTransition',
          `A set cannot be confirmed on an exercise session in status ${exerciseSessionRow.status}.`,
          { exerciseSessionId, status: exerciseSessionRow.status },
        );
      }

      // §5.4: the set index must extend the existing list, one at a time.
      const storeIndex = sets.index('by_exerciseSession_index');
      const existingSets = await storeIndex.getAll(prefixKeyRange(exerciseSessionId));
      const lastIndex = existingSets.reduce(
        (highest, row) => Math.max(highest, row.index),
        SET_INDEX_START - 1,
      );
      if (set.index !== lastIndex + 1) {
        throw new StorageError(
          'invalidIndex',
          `Set index ${set.index} does not extend the list; expected ${lastIndex + 1}.`,
          { expected: lastIndex + 1, actual: set.index },
        );
      }
      if (existingSets.some((row) => row.id === set.id)) {
        throw new StorageError('duplicate', `Set ${set.id} is already stored.`, { setId: set.id });
      }

      // I-9, inside this transaction and over this store: serialised across contexts.
      if (sessionRow.status === 'scheduled') {
        await assertNoOtherInProgress(tx, sessionRow.id);
      }

      await writeStamped({
        ...this.sync,
        tx,
        table: 'sets',
        key: set.id,
        row: setToRow(set, exerciseSessionId, sessionId),
      });

      await writeStamped({
        ...this.sync,
        tx,
        table: 'session_exercises',
        key: exerciseSessionId,
        row: { ...exerciseSessionRow, status: 'active', usedWeightKg: set.weightKg },
      });

      await writeStamped({
        ...this.sync,
        tx,
        table: 'sessions',
        key: sessionId,
        row: {
          ...sessionRow,
          status: sessionRow.status === 'scheduled' ? 'inProgress' : sessionRow.status,
          startedAt: sessionRow.startedAt ?? set.confirmedAt,
        },
      });

      const updated = await loadSession(tx, sessionId);
      if (updated === null) {
        throw new StorageError('failed', `Session ${sessionId} disappeared during its own write.`);
      }
      return updated;
    });
  }

  async recordDecision(input: LoadDecisionInput): Promise<LoadDecisionRecord> {
    return this.database.write(['exerciseSessions', QUEUE_STORE], async (tx) => {
      const store = tx.objectStore('exerciseSessions');
      const row = await store.get(input.exerciseSessionId);
      if (row === undefined) {
        throw new StorageError(
          'notFound',
          `Exercise session ${input.exerciseSessionId} is not stored.`,
          { exerciseSessionId: input.exerciseSessionId },
        );
      }
      // I-2 and I-8: the decision is written once. It is evidence, not state.
      if (row.decision !== null) {
        throw new StorageError(
          'conflict',
          'A load decision is already recorded for this exercise session.',
          { exerciseSessionId: input.exerciseSessionId },
        );
      }

      const usedWeightKg = resolveUsedWeight(input);
      // I-8: stored with the decision, computed here and never recomputed.
      const loadDeltaKg =
        input.recommendedWeightKg === null ? null : usedWeightKg - input.recommendedWeightKg;

      await writeStamped({
        ...this.sync,
        tx,
        table: 'session_exercises',
        key: input.exerciseSessionId,
        row: {
          ...row,
          decision: input.decision,
          recommendedWeightKg: input.recommendedWeightKg,
          usedWeightKg,
          loadDeltaKg,
        },
      });

      return {
        exerciseSessionId: input.exerciseSessionId,
        decision: input.decision,
        recommendedWeightKg: input.recommendedWeightKg,
        usedWeightKg,
        loadDeltaKg,
      };
    });
  }

  /**
   * S4/T5: one transaction over the row and its (empty) set list.
   *
   * Three guards, all inside the transaction:
   * 1. a closed session cannot be rewritten;
   * 2. an exercise that already reached `done`/`skipped` cannot be swapped;
   * 3. **no confirmed set** — the work already done was done by the prescribed exercise,
   *    and moving those sets onto the substitute's key would mix the two histories (S6).
   *
   * The decision columns and the frozen recommendation are cleared with the swap: both
   * belonged to the exercise being replaced, and carrying either across is exactly the
   * accidental mix S6 forbids. The prescription stays — it is the slot's, and the plan is
   * not touched.
   */
  async substitute(input: SubstituteExerciseInput): Promise<ExerciseSessionState> {
    return this.database.write(['sessions', 'exerciseSessions', 'sets', QUEUE_STORE], async (tx) => {
      const exercises = tx.objectStore('exerciseSessions');
      const row = await exercises.get(input.exerciseSessionId);
      if (row === undefined) {
        throw new StorageError(
          'notFound',
          `Exercise session ${input.exerciseSessionId} is not stored.`,
          { exerciseSessionId: input.exerciseSessionId },
        );
      }

      const session = await tx.objectStore('sessions').get(row.sessionId);
      if (session === undefined) {
        throw new StorageError('notFound', `Session ${row.sessionId} is not stored.`, {
          sessionId: row.sessionId,
        });
      }
      if (TERMINAL_STATUSES.includes(session.status)) {
        throw new StorageError(
          'invalidTransition',
          `Session ${session.id} is ${session.status}; a closed session cannot substitute.`,
          { sessionId: session.id, status: session.status },
        );
      }
      if (row.status === 'done' || row.status === 'skipped') {
        throw new StorageError(
          'invalidTransition',
          `Exercise session ${row.id} is ${row.status}; only a pending one can be substituted.`,
          { exerciseSessionId: row.id, status: row.status },
        );
      }

      const confirmed = await tx
        .objectStore('sets')
        .index('by_exerciseSession_index')
        .getAll(prefixKeyRange(input.exerciseSessionId));
      if (confirmed.length > 0) {
        throw new StorageError(
          'conflict',
          'The exercise already has confirmed sets; they belong to it, not to the substitute.',
          { exerciseSessionId: input.exerciseSessionId, sets: confirmed.length },
        );
      }

      const updated: ExerciseSessionRow = {
        ...row,
        exerciseId: input.exerciseId,
        exerciseNameSnapshot: input.exerciseNameSnapshot,
        recommendation: null,
        decision: null,
        recommendedWeightKg: null,
        usedWeightKg: null,
        loadDeltaKg: null,
        substitutedFrom: { ...input.substitutedFrom },
      };
      await writeStamped({
        ...this.sync,
        tx,
        table: 'session_exercises',
        key: updated.id,
        row: updated,
      });
      return stripSets(exerciseSessionFromRow(updated, []));
    });
  }

  async finish(sessionId: Uuid, status: SessionStatus, at: number): Promise<SessionStateChange> {
    if (!TERMINAL_STATUSES.includes(status)) {
      throw new StorageError(
        'invalid',
        `finish() takes a terminal status; ${status} is not one of ${TERMINAL_STATUSES.join(', ')}.`,
        { status },
      );
    }

    return this.database.write(['sessions', 'exerciseSessions', QUEUE_STORE], async (tx) => {
      const sessions = tx.objectStore('sessions');
      const row = await sessions.get(sessionId);
      if (row === undefined) {
        throw new StorageError('notFound', `Session ${sessionId} is not stored.`, { sessionId });
      }
      // §7: scheduled -> completed does not exist; only inProgress finishes.
      if (row.status !== 'inProgress') {
        throw new StorageError(
          'invalidTransition',
          `Session ${sessionId} is ${row.status}; only an inProgress session can finish.`,
          { sessionId, status: row.status },
        );
      }

      const exerciseSessions = tx.objectStore('exerciseSessions');
      const exerciseRows = await exerciseSessions
        .index('by_session_order')
        .getAll(prefixKeyRange(sessionId));

      const settled = status === 'completed' ? 'done' : 'skipped';
      const updatedExercises: ExerciseSessionRow[] = [];
      for (const exerciseRow of exerciseRows) {
        if (exerciseRow.status !== 'active') {
          updatedExercises.push(exerciseRow);
          continue;
        }
        const updated: ExerciseSessionRow = {
          ...exerciseRow,
          status: settled,
          completedAt: at,
        };
        await writeStamped({
          ...this.sync,
          tx,
          table: 'session_exercises',
          key: updated.id,
          row: updated,
        });
        updatedExercises.push(updated);
      }

      const updatedSession: SessionRow = { ...row, status, endedAt: at };
      await writeStamped({
        ...this.sync,
        tx,
        table: 'sessions',
        key: updatedSession.id,
        row: updatedSession,
      });

      return {
        id: updatedSession.id,
        planDayId: updatedSession.planDayId,
        dayNameSnapshot: updatedSession.dayNameSnapshot,
        scheduledDate: updatedSession.scheduledDate,
        startedAt: updatedSession.startedAt,
        endedAt: updatedSession.endedAt,
        phase: updatedSession.phase,
        status: updatedSession.status,
        // The set lists are not in this transaction's scope (§5.4): read `byId` for the
        // aggregate. Reporting a set list here would be a lie.
        exercises: updatedExercises.map((exerciseRow) =>
          stripSets(exerciseSessionFromRow(exerciseRow, [])),
        ),
      };
    });
  }

  async markDeletionPending(id: Uuid): Promise<void> {
    await this.database.write(['sessions', QUEUE_STORE], async (tx) => {
      const store = tx.objectStore('sessions');
      const row = await store.get(id);
      if (row === undefined) {
        throw new StorageError('notFound', `Session ${id} is not stored.`, { sessionId: id });
      }
      await writeStamped({
        ...this.sync,
        tx,
        table: 'sessions',
        key: id,
        row: { ...row, deletionPending: true },
      });
    });
  }

  async pendingDeletionIds(): Promise<readonly Uuid[]> {
    return this.database.read(['sessions'], async (tx) => {
      const rows = await tx.objectStore('sessions').getAll();
      return rows
        .filter((row) => row.deletionPending && !isTombstone(row))
        .map((row) => row.id);
    });
  }

  /** I-1: the cascade by hand, in one transaction, after the typed confirmation. */
  async delete(sessionId: Uuid, input: DeleteSessionInput): Promise<void> {
    await this.database.write(['sessions', 'exerciseSessions', 'sets', QUEUE_STORE], async (tx) => {
      const sessions = tx.objectStore('sessions');
      const row = await sessions.get(sessionId);
      if (row === undefined) {
        throw new StorageError('notFound', `Session ${sessionId} is not stored.`, { sessionId });
      }
      // I-5: flagged first, removed second. The flag is committed in its own step.
      if (!row.deletionPending) {
        throw new StorageError(
          'conflict',
          'Mark the deletion first: a session with confirmed sets is never removed in one step.',
          { sessionId },
        );
      }
      if (input.confirmation !== deleteSessionConfirmation(row.dayNameSnapshot)) {
        throw new StorageError('confirmationRequired', 'The typed confirmation does not match.', {
          expected: deleteSessionConfirmation(row.dayNameSnapshot),
        });
      }

      const exerciseSessions = tx.objectStore('exerciseSessions');
      const exerciseRows = await exerciseSessions
        .index('by_session_order')
        .getAll(prefixKeyRange(sessionId));

      const sets = tx.objectStore('sets');
      const setIndex = sets.index('by_exerciseSession_index');
      for (const exerciseRow of exerciseRows) {
        const setKeys = await setIndex.getAllKeys(prefixKeyRange(exerciseRow.id));
        for (const key of setKeys) {
          await deleteStamped({ ...this.sync, tx, table: 'sets', key });
        }
        await deleteStamped({
          ...this.sync,
          tx,
          table: 'session_exercises',
          key: exerciseRow.id,
        });
      }

      await deleteStamped({ ...this.sync, tx, table: 'sessions', key: sessionId });
    });
  }
}

/** I-9: at most one session is `inProgress`. Read and checked inside the transaction. */
async function assertNoOtherInProgress(tx: WriteTx, sessionId: Uuid): Promise<void> {
  const rows = await tx.objectStore('sessions').index('by_status').getAll('inProgress');
  const other = rows.find(
    (row) => row.id !== sessionId && !row.deletionPending && !isTombstone(row),
  );
  if (other !== undefined) {
    throw new StorageError('conflict', 'Another session is already in progress.', {
      sessionId: other.id,
    });
  }
}

function stripSets(exerciseSession: ExerciseSession): ExerciseSessionState {
  return {
    id: exerciseSession.id,
    order: exerciseSession.order,
    exerciseId: exerciseSession.exerciseId,
    exerciseNameSnapshot: exerciseSession.exerciseNameSnapshot,
    prescription: exerciseSession.prescription,
    recommendation: exerciseSession.recommendation,
    decision: exerciseSession.decision,
    recommendedWeightKg: exerciseSession.recommendedWeightKg,
    usedWeightKg: exerciseSession.usedWeightKg,
    loadDeltaKg: exerciseSession.loadDeltaKg,
    status: exerciseSession.status,
    completedAt: exerciseSession.completedAt,
  };
}

function sortByDate(rows: readonly SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => a.scheduledDate - b.scheduledDate || a.id.localeCompare(b.id));
}

function resolveUsedWeight(input: LoadDecisionInput): number {
  switch (input.decision.kind) {
    case 'accepted':
      if (input.recommendedWeightKg === null) {
        throw new StorageError(
          'invalid',
          'A recommendation cannot be accepted when there was no recommended weight.',
          { exerciseSessionId: input.exerciseSessionId },
        );
      }
      return input.recommendedWeightKg;
    case 'repeated':
      if (input.previousWeightKg === null) {
        throw new StorageError('invalid', 'There is no previous weight to repeat.', {
          exerciseSessionId: input.exerciseSessionId,
        });
      }
      return input.previousWeightKg;
    case 'manual':
      return input.decision.kg;
  }
}
