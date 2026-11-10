/**
 * Deleting a recorded activity — the bin, the question, and the port call (spec S5).
 *
 * The owner asked for a bin that asks before it removes («que me pregunte si estoy
 * seguro»), and L3 of the task fixes the shape of that safety rule: **the question is a
 * step in the screen, not a dialog.** So the state lives in `deletionReducer`, the yes is
 * a button, and `window.confirm` is never called — a browser dialog would be the one
 * control the system cannot style, size or name.
 *
 * Two invariants the reducer keeps, and the tests pin:
 *
 * 1. **One tap removes nothing.** `ask` only opens a question; the only event that
 *    starts a removal is `start`, and it is ignored unless a question is open for the
 *    row the owner tapped. A stray `start` cannot delete anything.
 * 2. **Absence of a question is the default.** `NO_DELETION` is an idle screen, and
 *    `cancel` returns to exactly that state.
 *
 * The write itself is `deleteActivity`, which goes through `activities.remove` and
 * nothing else: no session is created, marked or touched, so the rotation cannot move
 * because a football match was deleted (S6).
 */

import { useCallback, useReducer, useRef } from 'react';
import type { StoragePort } from '../../storage';

/** The words of the inline confirmation. Spanish, and short enough for 320 px. */
export const ACTIVITY_DELETE_COPY = {
  ask: '¿Eliminar?',
  confirm: 'Sí',
  cancel: 'Cancelar',
  deleted: 'Actividad eliminada.',
  failed: 'No se pudo eliminar la actividad. Inténtalo otra vez.',
} as const;

export type DeleteOutcome = 'deleted' | 'failed';

/**
 * Removes one activity row through the port.
 *
 * A failure is a sentence on the screen, never a thrown error: the owner tapped a bin,
 * and a rejected transaction must not take Inicio down with it.
 */
export async function deleteActivity(storage: StoragePort, id: string): Promise<DeleteOutcome> {
  try {
    await storage.activities.remove(id);
    return 'deleted';
  } catch {
    return 'failed';
  }
}

/** What the screen knows about the confirmation it is showing. */
export interface DeletionState {
  /** The row whose bin was tapped, or `null` when no question is open. */
  readonly pendingId: string | null;
  /** True while the removal is in flight: the yes and the cancel are disabled. */
  readonly busy: boolean;
  /** The plain result line of the last attempt; `null` before the first one. */
  readonly notice: string | null;
}

export const NO_DELETION: DeletionState = { pendingId: null, busy: false, notice: null };

export type DeletionEvent =
  | { readonly type: 'ask'; readonly id: string }
  | { readonly type: 'cancel' }
  /** The yes. It carries no id on purpose: it can only act on the open question. */
  | { readonly type: 'start' }
  | { readonly type: 'settle'; readonly ok: boolean };

/** The confirmation as a small state machine, so "one tap deletes" is not expressible. */
export function deletionReducer(state: DeletionState, event: DeletionEvent): DeletionState {
  switch (event.type) {
    case 'ask':
      // A tap on a bin while another removal is in flight changes nothing, and a tap on
      // a bin only asks: no request starts and no previous result is carried over.
      return state.busy ? state : { pendingId: event.id, busy: false, notice: null };
    case 'cancel':
      return state.busy ? state : NO_DELETION;
    case 'start':
      // The whole safety rule in one guard: without an open question there is nothing
      // for the yes to confirm.
      if (state.pendingId === null || state.busy) return state;
      return { ...state, busy: true, notice: null };
    case 'settle':
      return {
        pendingId: null,
        busy: false,
        notice: event.ok ? ACTIVITY_DELETE_COPY.deleted : ACTIVITY_DELETE_COPY.failed,
      };
  }
}

export interface ActivityDeletionDeps {
  readonly storage: StoragePort;
  /** Called after a successful removal, so the screen re-reads its own rows. */
  readonly onDeleted?: (() => void) | undefined;
}

export interface ActivityDeletionState extends DeletionState {
  /** First tap: open the question for this row. */
  ask(id: string): void;
  /** «Cancelar»: close it, remove nothing. */
  cancel(): void;
  /** «Sí»: remove the row the question is about. */
  confirm(id: string): void;
}

/**
 * The React seam, shaped like `useFootballCapture`: a ref is the double-tap guard (two
 * taps in the same tick both read the old state) and the reducer holds the question.
 */
export function useActivityDeletion(deps: ActivityDeletionDeps): ActivityDeletionState {
  const [state, dispatch] = useReducer(deletionReducer, NO_DELETION);
  const inFlight = useRef(false);
  const { storage, onDeleted } = deps;
  const { pendingId } = state;

  const confirm = useCallback(
    (id: string) => {
      // The reducer repeats this guard; here it also stops the request from being sent
      // twice, which the reducer alone cannot see.
      if (pendingId === null || pendingId !== id || inFlight.current) return;
      inFlight.current = true;
      dispatch({ type: 'start' });
      void deleteActivity(storage, id).then((outcome) => {
        inFlight.current = false;
        dispatch({ type: 'settle', ok: outcome === 'deleted' });
        if (outcome === 'deleted') onDeleted?.();
      });
    },
    [pendingId, storage, onDeleted],
  );

  const ask = useCallback((id: string) => dispatch({ type: 'ask', id }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);

  return { ...state, ask, cancel, confirm };
}
