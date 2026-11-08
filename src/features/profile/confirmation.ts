/**
 * The typed confirmation — docs/data-model.md §9 (restore), §10 (deletion), I-5.
 *
 * The storage layer refuses both destructive operations unless the exact word arrives
 * (`RESTORE_CONFIRMATION`, `DELETE_ALL_CONFIRMATION`). This module is the gate the
 * screen draws, and it is deliberately strict in one way: it never trims, never folds
 * case and never accepts a prefix. A key held down produces a longer string, not the
 * word, so no accidental tap and no sticky keyboard can destroy the history or the only
 * copy of it.
 *
 * The words themselves are imported, never repeated: a test asserts they are the
 * storage layer's constants, so the two cannot drift apart.
 */

import { DELETE_ALL_CONFIRMATION, RESTORE_CONFIRMATION } from '../../storage';

export type ConfirmationGate = 'empty' | 'wrong' | 'ready';

/** Exact comparison, on purpose. `expected` is passed in so the test can prove it. */
export function confirmationGate(typed: string, expected: string): ConfirmationGate {
  if (typed === '') return 'empty';
  return typed === expected ? 'ready' : 'wrong';
}

export type RestoreGate = 'no-document' | ConfirmationGate;

/**
 * Restoring has two gates and both must be open: a document that validated (nothing is
 * written before that, §9) and the typed word. The order matters for the copy: before a
 * document exists the screen says nothing about the word.
 */
export function restoreGate(input: {
  readonly validated: boolean;
  readonly typed: string;
}): RestoreGate {
  if (!input.validated) return 'no-document';
  return confirmationGate(input.typed, RESTORE_CONFIRMATION);
}

/** §10: `Borrar todos los datos`, with the word the storage layer checks. */
export function deleteGate(typed: string): ConfirmationGate {
  return confirmationGate(typed, DELETE_ALL_CONFIRMATION);
}
