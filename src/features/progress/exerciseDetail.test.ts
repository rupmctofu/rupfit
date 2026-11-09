/**
 * The exercise drill-down's data and its hash, pinned.
 *
 * Same rule as `aggregates.test.ts`: every value here is derived from stored rows, so
 * the tests build stored rows with the storage shapes themselves. What these tests
 * protect is the part that would be easy to get quietly wrong: the key (an id, or the
 * snapshot name when a deleted exercise has none), the order of the points, the refusal
 * to treat a plan or an open sheet as history, and the hash round-trip of a name key.
 */

import { describe, expect, it } from 'vitest';
import { EFFORT } from '../../core/domain';
import type { Exercise } from '../../storage';
import { exerciseHistory, exerciseFor, exerciseUsages, openSessionOf } from './exerciseDetail';
import { exerciseKey } from './aggregates';
import { exerciseKeyFromHash, exerciseViewHash, parseProgressView } from './navigation';
import { formatRepRange, formatRest } from './format';
import { at, BENCH, exerciseSession, session, set, SQUAT } from './fixtures';

const LIBRARY: readonly Exercise[] = [
  {
    id: SQUAT.id,
    name: SQUAT.name,
    primaryMuscle: 'quadriceps',
    pattern: 'squat',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: false,
  },
  {
    id: BENCH.id,
    name: BENCH.name,
    primaryMuscle: 'chest',
    pattern: 'horizontalPush',
    equipment: 'barbell',
    loadIncrementKg: 2.5,
    isCustom: false,
    isArchived: false,
  },
];

const KEY = SQUAT.id;

describe('the exercise key', () => {
  it('uses the id, and the snapshot name only when the library row is gone', () => {
    expect(exerciseKey(exerciseSession())).toBe(SQUAT.id);
    expect(exerciseKey(exerciseSession({ exerciseId: null }))).toBe(`name:${SQUAT.name}`);
  });

  it('resolves the library row by id, and by name for a deleted exercise', () => {
    expect(exerciseFor(LIBRARY, SQUAT.id, SQUAT.name)?.id).toBe(SQUAT.id);
    expect(exerciseFor(LIBRARY, `name:${BENCH.name}`, BENCH.name)?.id).toBe(BENCH.id);
    // A renamed or removed row stays unfound instead of matching a neighbour.
    expect(exerciseFor(LIBRARY, 'name:Sentadilla búlgara', 'Sentadilla búlgara')).toBeUndefined();
  });
});

describe('the per-exercise history', () => {
  const sessions = [
    session({
      id: 's-old',
      scheduledDate: at(2024, 10, 4, 18),
      exercises: [
        exerciseSession({
          id: 'e-old',
          sets: [set({ weightKg: 80, actualReps: 8, confirmedAt: at(2024, 10, 4, 18) })],
        }),
      ],
    }),
    session({
      id: 's-new',
      scheduledDate: at(2024, 10, 6, 18),
      exercises: [
        exerciseSession({
          id: 'e-new',
          sets: [
            set({ weightKg: 90, actualReps: 8, confirmedAt: at(2024, 10, 6, 18) }),
            set({ weightKg: 92.5, actualReps: 10, confirmedAt: at(2024, 10, 6, 18) }),
          ],
        }),
      ],
    }),
  ];

  it('reads every recorded session ascending, with the heaviest set of each', () => {
    const history = exerciseHistory(sessions, KEY);
    expect(history).not.toBeNull();
    expect(history?.sessionCount).toBe(2);
    expect(history?.setCount).toBe(3);
    expect(history?.points.map((point) => point.at)).toEqual([
      at(2024, 10, 4, 18),
      at(2024, 10, 6, 18),
    ]);
    expect(history?.points.map((point) => point.topSetKg)).toEqual([80, 92.5]);
    expect(history?.lastPoint?.topSetReps).toBe(10);
    expect(history?.lastPoint?.setsPrescribed).toBe(3);
    expect(history?.lastSession?.exercise.id).toBe('e-new');
  });

  it('does not turn a plan or an open sheet into history', () => {
    const planned = [
      session({
        id: 's-scheduled',
        scheduledDate: at(2024, 10, 7, 18),
        status: 'scheduled',
        exercises: [exerciseSession({ sets: [set({ weightKg: 100, actualReps: 5, confirmedAt: at(2024, 10, 7, 18) })] })],
      }),
      session({
        id: 's-open',
        scheduledDate: at(2024, 10, 6, 18),
        status: 'inProgress',
        exercises: [exerciseSession({ sets: [set({ weightKg: 95, actualReps: 5, confirmedAt: at(2024, 10, 6, 18) })] })],
      }),
    ];
    expect(exerciseHistory(planned, KEY)).toBeNull();
    expect(exerciseUsages(planned)).toEqual([]);
    // The open sheet is read, but as the open sheet.
    expect(openSessionOf(planned, KEY)?.session.id).toBe('s-open');
  });

  it('skips the exercise of a recorded session that was never set down', () => {
    const skipped = [
      session({
        id: 's-one',
        scheduledDate: at(2024, 10, 6, 18),
        exercises: [
          exerciseSession({ id: 'e-done', sets: [set({ weightKg: 90, actualReps: 8, confirmedAt: at(2024, 10, 6, 18) })] }),
          exerciseSession({ id: 'e-skipped', exerciseId: BENCH.id, name: BENCH.name }),
        ],
      }),
    ];
    expect(exerciseHistory(skipped, BENCH.id)).toBeNull();
    expect(exerciseHistory(skipped, KEY)?.sessionCount).toBe(1);
  });

  it('lists the exercises with sets, most recently trained first', () => {
    const usages = exerciseUsages([
      ...sessions,
      session({
        id: 's-bench',
        scheduledDate: at(2024, 10, 5, 18),
        exercises: [
          exerciseSession({
            id: 'e-bench',
            exerciseId: BENCH.id,
            name: BENCH.name,
            sets: [set({ weightKg: 60, actualReps: 8, confirmedAt: at(2024, 10, 5, 18) })],
          }),
        ],
      }),
    ]);
    expect(usages.map((usage) => usage.key)).toEqual([KEY, BENCH.id]);
    expect(usages[0]?.topSetKg).toBe(92.5);
    expect(usages[0]?.lastAt).toBe(at(2024, 10, 6, 18));
  });

  it('keeps a bodyweight exercise without a load instead of writing 0 kg', () => {
    const bodyweight = [
      session({
        id: 's-bw',
        scheduledDate: at(2024, 10, 6, 18),
        exercises: [
          exerciseSession({
            id: 'e-bw',
            sets: [set({ weightKg: 0, actualReps: 12, effort: EFFORT.easy, confirmedAt: at(2024, 10, 6, 18) })],
          }),
        ],
      }),
    ];
    const history = exerciseHistory(bodyweight, KEY);
    expect(history?.points[0]?.topSetKg).toBeNull();
    expect(history?.points[0]?.topSetReps).toBeNull();
    expect(exerciseUsages(bodyweight)[0]?.topSetKg).toBeNull();
  });
});

describe('the exercise hash', () => {
  it('round-trips an id and a name key', () => {
    expect(exerciseViewHash(SQUAT.id)).toBe('#/progreso/ejercicio/ex-sentadilla');
    expect(exerciseViewHash(`name:${SQUAT.name}`)).toBe(
      '#/progreso/ejercicio/name%3ASentadilla%20trasera',
    );
    for (const key of [SQUAT.id, `name:${SQUAT.name}`, 'name:Press de banca']) {
      expect(exerciseKeyFromHash(exerciseViewHash(key))).toBe(key);
      expect(parseProgressView(exerciseViewHash(key))).toBe('exercise');
    }
  });

  it('is not a detail without a readable key', () => {
    expect(parseProgressView('#/progreso/ejercicio')).toBe('summary');
    expect(exerciseKeyFromHash('#/progreso/ejercicio')).toBeNull();
    expect(exerciseKeyFromHash('#/progreso/ejercicio/%zz')).toBeNull();
    expect(parseProgressView('#/progreso/ejercicio/%zz')).toBe('summary');
    expect(parseProgressView('#/progreso/historial')).toBe('historial');
  });
});

describe('the prescription formatting', () => {
  it('writes the rep range and the rest the Spanish way', () => {
    expect(formatRepRange({ lowerBound: 6, upperBound: 8 })).toBe('6–8');
    expect(formatRest(180)).toBe('3:00');
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(45)).toBe('0:45');
  });
});
