/**
 * The first-run write: what it puts in the store, in which order, and what a second run
 * does to a store that already has some of it.
 *
 * The four claims a fresh install depends on, each one an assertion below:
 *
 * 1. **A usable state at every step.** The library is written first because the plan names
 *    its ids; the profile is written last because the presence of a profile is what tells
 *    the shell the setup is done. A failure anywhere leaves a store the next run can
 *    finish, never one that is half-written and unreachable.
 * 2. **Idempotence.** The ids come from the seed, so running the sequence twice writes
 *    over the same rows instead of adding new ones.
 * 3. **Resumability.** A store with a profile and no library — the state an abandoned run
 *    leaves — is completed by the same call, and the profile the owner already has is not
 *    replaced by a second row.
 * 4. **Nothing the owner changed is overwritten.** A day that already exists is left
 *    alone, so the escape hatch for an existing store is additive and safe.
 */

import { describe, expect, it } from 'vitest';
import type {
  Exercise,
  PhaseState,
  PlanDay,
  UserProfile,
} from '../../storage';
import { seedPlanDays, SEED_EXERCISES } from '../../core/seed';
import {
  STARTING_POINT_COPY,
  startingPointRows,
  writeStartingPoint,
  type StartingPointStore,
} from './starting-point';

const PROFILE: UserProfile = {
  id: 'profile-1',
  displayName: 'Rup',
  massUnit: 'kilograms',
  weightGoal: 'maintain',
  weeklyTrainingDays: 3,
  availableEquipment: ['barbell', 'dumbbell'],
  autoStartRestTimer: true,
};

interface FakeStore extends StartingPointStore {
  readonly calls: readonly string[];
  readonly rows: {
    readonly exercises: Map<string, Exercise>;
    readonly planDays: Map<string, PlanDay>;
    profile: UserProfile | undefined;
    phaseState: PhaseState | undefined;
  };
}

interface FakeOptions {
  readonly exercises?: readonly Exercise[];
  readonly planDays?: readonly PlanDay[];
  readonly profile?: UserProfile;
  readonly phaseState?: PhaseState;
  /** Refuses the port method with this name, so a failure has one known cause. */
  readonly failOn?: string;
}

function fakeStore(options: FakeOptions = {}): FakeStore {
  const calls: string[] = [];
  const rows = {
    exercises: new Map((options.exercises ?? []).map((row) => [row.id, row])),
    planDays: new Map((options.planDays ?? []).map((row) => [row.id, row])),
    profile: options.profile,
    phaseState: options.phaseState,
  };

  const guard = (name: string): void => {
    calls.push(name);
    if (options.failOn === name) throw new Error(`fake store: ${name} failed on purpose`);
  };

  return {
    calls,
    rows,
    exercises: {
      all: () => {
        guard('exercises.all');
        return Promise.resolve([...rows.exercises.values()]);
      },
      save: (exercise) => {
        guard('exercises.save');
        rows.exercises.set(exercise.id, exercise);
        return Promise.resolve();
      },
    },
    plan: {
      all: () => {
        guard('plan.all');
        return Promise.resolve([...rows.planDays.values()]);
      },
      save: (day) => {
        guard('plan.save');
        rows.planDays.set(day.id, day);
        return Promise.resolve();
      },
    },
    meta: {
      readPhaseState: () => {
        guard('meta.readPhaseState');
        return Promise.resolve(rows.phaseState);
      },
      savePhaseState: (state) => {
        guard('meta.savePhaseState');
        rows.phaseState = state;
        return Promise.resolve();
      },
    },
    profile: {
      save: (profile) => {
        guard('profile.save');
        rows.profile = profile;
        return Promise.resolve();
      },
    },
  };
}

function callIndex(store: FakeStore, name: string): number {
  return store.calls.indexOf(name);
}

describe('startingPointRows', () => {
  it('asks for the whole library and the whole plan on an empty store', () => {
    const rows = startingPointRows({ exercises: [], planDays: [], phaseState: undefined });

    expect(rows.exercises).toHaveLength(SEED_EXERCISES.length);
    expect(rows.planDays).toHaveLength(3);
    expect(rows.phaseState).toEqual({ block: 1, passedBlocks: 0 });
  });

  it('asks only for what is missing, and never for a phase state that already exists', () => {
    const kept = SEED_EXERCISES[0] as Exercise;
    const rows = startingPointRows({
      exercises: [kept],
      planDays: seedPlanDays(),
      phaseState: { block: 3, passedBlocks: 2 },
    });

    expect(rows.exercises.map((exercise) => exercise.id)).not.toContain(kept.id);
    expect(rows.exercises).toHaveLength(SEED_EXERCISES.length - 1);
    expect(rows.planDays).toEqual([]);
    // Real progress is never reset by a rerun.
    expect(rows.phaseState).toBeNull();
  });
});

describe('writeStartingPoint', () => {
  it('writes the library, then the plan, then the phase, then the profile', async () => {
    const store = fakeStore();

    const outcome = await writeStartingPoint(store, PROFILE);

    expect(outcome).toEqual({
      kind: 'done',
      written: {
        exercises: SEED_EXERCISES.length,
        planDays: 3,
        phaseState: 1,
        profile: 1,
      },
    });
    expect(store.rows.exercises.size).toBe(SEED_EXERCISES.length);
    expect(store.rows.planDays.size).toBe(3);
    expect(store.rows.phaseState).toEqual({ block: 1, passedBlocks: 0 });
    expect(store.rows.profile).toEqual(PROFILE);

    // The order is the guarantee: the plan names library ids, and the profile is the flag
    // that says the store is ready to train, so it is written last.
    const firstExercise = callIndex(store, 'exercises.save');
    const lastExercise = store.calls.lastIndexOf('exercises.save');
    const firstDay = callIndex(store, 'plan.save');
    const phase = callIndex(store, 'meta.savePhaseState');
    const profile = callIndex(store, 'profile.save');

    expect(firstExercise).toBeGreaterThanOrEqual(0);
    expect(lastExercise).toBeLessThan(firstDay);
    expect(firstDay).toBeLessThan(phase);
    expect(phase).toBeLessThan(profile);
  });

  it('leaves the same row count when the sequence runs twice', async () => {
    const store = fakeStore();

    await writeStartingPoint(store, PROFILE);
    const first = {
      exercises: store.rows.exercises.size,
      planDays: store.rows.planDays.size,
      profile: store.rows.profile?.id,
    };
    await writeStartingPoint(store, PROFILE);

    expect(store.rows.exercises.size).toBe(first.exercises);
    expect(store.rows.planDays.size).toBe(first.planDays);
    expect(store.rows.profile?.id).toBe(first.profile);
    expect(store.rows.exercises.size).toBe(SEED_EXERCISES.length);
    expect(store.rows.planDays.size).toBe(3);
  });

  it('resumes a store whose profile was written and whose library is missing', async () => {
    const store = fakeStore({ profile: PROFILE });

    const outcome = await writeStartingPoint(store, PROFILE);

    expect(outcome.kind).toBe('done');
    expect(store.rows.exercises.size).toBe(SEED_EXERCISES.length);
    expect(store.rows.planDays.size).toBe(3);
    expect(store.rows.phaseState).toEqual({ block: 1, passedBlocks: 0 });
    // One profile row, the one the owner already had: the store is keyed by `profile`.
    expect(store.rows.profile).toEqual(PROFILE);
  });

  it('does not overwrite a day the owner already has', async () => {
    // One of the seeded days, renamed by the owner: the starting point must leave it
    // alone and write only the days that are missing.
    const edited: PlanDay = {
      id: 'seed-day-leg',
      name: 'MI RUTINA DE PIERNA',
      order: 0,
      items: [],
    };
    const store = fakeStore({ planDays: [edited] });

    await writeStartingPoint(store, PROFILE);

    expect(store.rows.planDays.get('seed-day-leg')).toEqual(edited);
    expect(store.rows.planDays.size).toBe(3);
  });

  it('stops at the step that failed, and says which one', async () => {
    const store = fakeStore({ failOn: 'plan.save' });

    const outcome = await writeStartingPoint(store, PROFILE);

    expect(outcome).toEqual({
      kind: 'failed',
      step: 'planDays',
      message: STARTING_POINT_COPY.planFailed,
    });
    // The library is complete and nothing later was written: the next run finishes it.
    expect(store.rows.exercises.size).toBe(SEED_EXERCISES.length);
    expect(store.rows.planDays.size).toBe(0);
    expect(store.rows.profile).toBeUndefined();
    expect(store.rows.phaseState).toBeUndefined();
  });

  it('does not write the profile when the phase write failed', async () => {
    const store = fakeStore({ failOn: 'meta.savePhaseState' });

    const outcome = await writeStartingPoint(store, PROFILE);

    expect(outcome.kind).toBe('failed');
    expect(store.rows.profile).toBeUndefined();
  });
});
