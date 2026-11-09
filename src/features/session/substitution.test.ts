/**
 * «Sugerir otro ejercicio» (S4, S6, T5): which rows may replace the current exercise, and
 * when the swap is refused.
 *
 * The three rules the storage write depends on are pinned here, because the screen is only
 * a view of them: the library decides the candidates, the declared equipment narrows them
 * when it says anything, and an exercise that already has an answered set is that exercise.
 */

import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../core/domain';
import type { ExerciseState } from '../../core/session/model';
import {
  canSubstitute,
  candidateById,
  SUBSTITUTION_REFUSED,
  substitutionCandidates,
  substitutionHint,
  substitutionNote,
} from './substitution';

function row(
  id: string,
  equipment: Exercise['equipment'],
  alternatives?: readonly string[],
): Exercise {
  return {
    id,
    name: `Ejercicio ${id}`,
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment,
    loadIncrementKg: equipment === 'barbell' ? 2.5 : 0,
    isCustom: false,
    isArchived: false,
    ...(alternatives === undefined ? {} : { alternatives }),
  };
}

const BARBELL = row('barbell-squat', 'barbell', ['machine-squat', 'goblet-squat', 'deleted-row', 'barbell-squat']);
const MACHINE = row('machine-squat', 'machine');
const GOBLET = row('goblet-squat', 'dumbbell');
const LIBRARY: readonly Exercise[] = [BARBELL, MACHINE, GOBLET];

function state(sets: number, status: ExerciseState['status'] = 'pending'): ExerciseState {
  return {
    id: 'session-exercise',
    exerciseId: BARBELL.id,
    exerciseNameSnapshot: BARBELL.name,
    prescription: {
      sets: 3,
      repRange: { lowerBound: 6, upperBound: 8 },
      targetRIR: { lowerBound: 4, upperBound: 5 },
      restSeconds: 180,
    },
    recommendation: null,
    decision: null,
    recommendedWeightKg: null,
    usedWeightKg: null,
    loadDeltaKg: null,
    sets: Array.from({ length: sets }, (_, index) => ({
      status: 'skipped' as const,
      slot: index + 1,
      at: 1_700_000_000_000,
    })),
    status,
    completedAt: null,
  };
}

describe('the alternatives offered for one session', () => {
  it('resolves the row alternatives against the library, never offering the exercise itself', () => {
    const candidates = substitutionCandidates(BARBELL, LIBRARY, []);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['machine-squat', 'goblet-squat']);
  });

  it('drops an id the library no longer has instead of showing a blank line', () => {
    const candidates = substitutionCandidates(BARBELL, [MACHINE], []);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['machine-squat']);
  });

  it('keeps everything when the profile declares no equipment', () => {
    expect(substitutionCandidates(BARBELL, LIBRARY, [])).toHaveLength(2);
  });

  it('keeps only the declared equipment when the profile declares some', () => {
    expect(
      substitutionCandidates(BARBELL, LIBRARY, ['machine']).map((candidate) => candidate.id),
    ).toEqual(['machine-squat']);
    expect(substitutionCandidates(BARBELL, LIBRARY, ['barbell'])).toEqual([]);
  });

  it('offers nothing for a row without alternatives or without a library entry', () => {
    expect(substitutionCandidates(MACHINE, LIBRARY, [])).toEqual([]);
    expect(substitutionCandidates(undefined, LIBRARY, [])).toEqual([]);
  });
});

describe('the choice the owner makes', () => {
  it('accepts only a candidate that was actually offered', () => {
    const candidates = substitutionCandidates(BARBELL, LIBRARY, ['machine']);
    expect(candidateById(candidates, 'machine-squat')?.id).toBe('machine-squat');
    // A stale tap or a hand-written id is not a substitution (S6: no mixing).
    expect(candidateById(candidates, 'goblet-squat')).toBeNull();
    expect(candidateById(candidates, BARBELL.id)).toBeNull();
  });

  it('refuses the swap once the exercise has an answered set or is settled', () => {
    expect(canSubstitute(state(0), true)).toBe(true);
    expect(canSubstitute(state(1), true)).toBe(false);
    expect(canSubstitute(state(0, 'done'), true)).toBe(false);
    expect(canSubstitute(state(0), false)).toBe(false);
  });
});

describe('the words of the swap', () => {
  it('says what the substitution replaces and that the plan does not move', () => {
    expect(substitutionNote('Prensa')).toContain('«Prensa»');
    expect(substitutionNote('Prensa')).toContain('solo en esta sesión');
    expect(SUBSTITUTION_REFUSED.length).toBeGreaterThan(20);
  });

  it('explains an empty list differently from a filtered one', () => {
    expect(substitutionHint(0, true)).toContain('material');
    expect(substitutionHint(0, false)).toContain('no tiene alternativas');
    expect(substitutionHint(2, true)).toContain('material');
  });
});
