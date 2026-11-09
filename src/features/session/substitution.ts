/**
 * «Sugerir otro ejercicio» — the library alternatives of the current exercise, offered for
 * this session only (odd/tasks/training-flow.md S4, S6, T5).
 *
 * Three rules, all here so the screen and the storage write cannot disagree:
 *
 * 1. **The library decides, not the screen.** A candidate is one of the row's
 *    `alternatives` resolved against the library; an id that no longer exists disappears
 *    instead of becoming a blank line, and an exercise is never its own alternative.
 * 2. **The declared equipment filters, when it says anything.** An empty
 *    `availableEquipment` means "the profile does not narrow it" and keeps every
 *    candidate; a non-empty one keeps only what the owner can actually use.
 * 3. **Once a set is confirmed, the exercise is that exercise.** The work belongs to the
 *    exercise that produced it (S6), so the swap is refused and the reason is said in
 *    Spanish. The plan is never touched: a session row is a snapshot.
 *
 * Pure: types in, data out.
 */

import type { Equipment, Exercise } from '../../core/domain';
import type { ExerciseState } from '../../core/session/model';

/** The library rows that can replace `detail` for this session. */
export function substitutionCandidates(
  detail: Exercise | undefined,
  library: readonly Exercise[],
  availableEquipment: readonly Equipment[],
): readonly Exercise[] {
  if (detail === undefined || detail.alternatives === undefined) return [];

  const allowed = new Set<Equipment>(availableEquipment);
  const found: Exercise[] = [];
  for (const id of detail.alternatives) {
    if (id === detail.id) continue;
    const row = library.find((exercise) => exercise.id === id);
    if (row === undefined) continue;
    if (allowed.size > 0 && !allowed.has(row.equipment)) continue;
    found.push(row);
  }
  return found;
}

/**
 * The candidate the owner picked, re-read from the offered list: an id that was not
 * offered — a stale tap, a hand-edited hash — is not a substitution.
 */
export function candidateById(
  candidates: readonly Exercise[],
  id: string,
): Exercise | null {
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

/**
 * Whether the swap may happen at all. Two conditions, both about what is already true of
 * the row: the session is open and this exercise has no answered set. `sets` counts
 * skipped slots too — a skipped set was still a decision about *this* exercise.
 */
export function canSubstitute(exercise: ExerciseState, sessionOpen: boolean): boolean {
  if (!sessionOpen) return false;
  if (exercise.status === 'done' || exercise.status === 'skipped') return false;
  return exercise.sets.length === 0;
}

/** The sentence a refused swap leaves on screen. */
export const SUBSTITUTION_REFUSED =
  'Ya hay series registradas en este ejercicio: se quedan con él.';

/** `Sustituye a «Prensa» solo en esta sesión.` — the read-out of a stored substitution. */
export function substitutionNote(originalName: string): string {
  return `Sustituye a «${originalName}» solo en esta sesión. El plan no cambia y su historial sigue siendo suyo.`;
}

/** `Buscamos alternativas con el material que tienes declarado.` — the picker's caption. */
export function substitutionHint(count: number, equipmentScoped: boolean): string {
  if (count === 0) {
    return equipmentScoped
      ? 'No hay alternativas con el material que tienes declarado.'
      : 'Este ejercicio no tiene alternativas en la biblioteca.';
  }
  return equipmentScoped
    ? 'Alternativas con el material que tienes declarado, para esta sesión.'
    : 'Alternativas de la biblioteca, para esta sesión.';
}
