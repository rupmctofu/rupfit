/**
 * Deleting a stored session (odd/tasks/delete-session.md).
 *
 * The repository owns the hard part: I-5 says a session is flagged in one committed step
 * and removed in the next, and only when the typed confirmation matches
 * `BORRAR <dayNameSnapshot>`. This module owns the decision the screen can make on its
 * own — whether the text on screen is the sentence that unlocks the delete — so the rule
 * can be tested without a DOM or a database, and the UI has one place to ask.
 */
import { deleteSessionConfirmation } from '../../storage';

export type DeleteGate = 'empty' | 'wrong' | 'ready';

/** What the owner must type: the same sentence the repository will verify. */
export function deletePhrase(dayNameSnapshot: string): string {
  return deleteSessionConfirmation(dayNameSnapshot);
}

/**
 * Three states, and no silent near-miss: an empty field is not an error yet, a different
 * sentence is, and only an exact match unlocks the button. Case is significant on purpose
 * — the phrase is a deliberate act, not a text field to speed through.
 */
export function deleteGate(typed: string, dayNameSnapshot: string): DeleteGate {
  if (typed.trim() === '') return 'empty';
  return typed.trim() === deletePhrase(dayNameSnapshot) ? 'ready' : 'wrong';
}

/** The hint under the field, in the words the screen shows. */
export function deleteHint(gate: DeleteGate, dayNameSnapshot: string): string {
  if (gate === 'ready') return 'Coincide: puedes borrar la sesión.';
  if (gate === 'wrong') return `No coincide. Escribe ${deletePhrase(dayNameSnapshot)}.`;
  return `Escribe ${deletePhrase(dayNameSnapshot)} para borrar la sesión.`;
}
