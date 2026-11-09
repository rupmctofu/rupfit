/**
 * An in-memory `StoragePort` — a test double and the demo's only persistence.
 *
 * Two jobs, one implementation:
 *
 * - **Tests** call it a recording fake: every port method appends its name to `calls`,
 *   so a test can assert the exact sequence a controller event produces, and
 *   `failOn` makes a chosen call reject so the error path is pinned instead of hoped
 *   for.
 * - **The demo** (`#/sesion/demo`) seeds it with one fixture session and never opens
 *   IndexedDB, so the screen can be reviewed on the phone before Inicio exists.
 *
 * It is deliberately small: it keeps the sessions, the exercise library and the
 * profile in memory and answers the reads the session screen performs. The backup,
 * deletion and measurement paths are not part of this screen, so they refuse instead
 * of pretending.
 */

import type {
  ActivityRecord,
  BodyMeasurement,
  Exercise,
  ExerciseSessionState,
  LoadDecisionInput,
  LoadDecisionRecord,
  OpenReport,
  OrphanReport,
  PlanDay,
  SessionStateChange,
  SetRecord,
  StoragePort,
  StorageState,
  SubstituteExerciseInput,
  UserProfile,
  WorkoutSession,
} from '../../storage';

export interface FakeStorageSeed {
  /** Stored sessions, aggregates included. The demo seeds one current session here. */
  readonly sessions?: readonly WorkoutSession[];
  readonly exercises?: readonly Exercise[];
  readonly profile?: UserProfile;
}

export interface FakeStorageOptions extends FakeStorageSeed {
  /**
   * Refuses the call whose recorded name matches, simulating a write that failed.
   * The name is the recorded one (`sessions.confirmSet`), so a test reads the same
   * string it asserts.
   */
  readonly failOn?: ((call: string) => boolean) | undefined;
}

export interface FakeStorage extends StoragePort {
  /** Every port method that ran, in order, as `repository.method`. */
  readonly calls: readonly string[];
  /** Forgets the recorded calls, so an assertion can start after boot. */
  reset(): void;
  /** The stored sessions, for a test that wants to inspect what was written. */
  stored(): readonly WorkoutSession[];
}

const NO_ORPHANS: OrphanReport = {
  setsWithoutExerciseSession: 0,
  exerciseSessionsWithoutSession: 0,
  planItemsWithoutPlanDay: 0,
};

const OPEN_STATE: StorageState = {
  status: 'open',
  currentVersion: 1,
  blockedVersion: null,
  detail: null,
};

function unsupported(what: string): never {
  throw new Error(`fake storage: ${what} is not part of the session screen`);
}

function copySession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      prescription: { ...exercise.prescription, repRange: { ...exercise.prescription.repRange } },
      sets: [...exercise.sets],
    })),
  };
}

export function createFakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const calls: string[] = [];
  let sessions: WorkoutSession[] = (options.sessions ?? []).map(copySession);
  let exercises: Exercise[] = [...(options.exercises ?? [])];
  let profile: UserProfile | undefined = options.profile;
  const measurements: BodyMeasurement[] = [];
  const activities: ActivityRecord[] = [];

  const record = (name: string): void => {
    calls.push(name);
    if (options.failOn !== undefined && options.failOn(name)) {
      throw new Error(`fake storage: ${name} failed on purpose`);
    }
  };

  const find = (id: string): WorkoutSession => {
    const session = sessions.find((candidate) => candidate.id === id);
    if (session === undefined) throw new Error(`fake storage: session ${id} is not stored`);
    return session;
  };

  const replace = (next: WorkoutSession): void => {
    sessions = sessions.map((candidate) => (candidate.id === next.id ? next : candidate));
  };

  const sessionsPort: StoragePort['sessions'] = {
    async byId(id) {
      record('sessions.byId');
      return sessions.find((candidate) => candidate.id === id);
    },
    async inProgress() {
      record('sessions.inProgress');
      return sessions.find((candidate) => candidate.status === 'inProgress');
    },
    async nextScheduledOnOrAfter(date) {
      record('sessions.nextScheduledOnOrAfter');
      return sessions
        .filter((candidate) => candidate.status === 'scheduled' && candidate.scheduledDate >= date)
        .sort((left, right) => left.scheduledDate - right.scheduledDate)[0];
    },
    async recent(limit) {
      record('sessions.recent');
      return [...sessions]
        .sort((left, right) => right.scheduledDate - left.scheduledDate)
        .slice(0, Math.max(0, limit))
        .map(copySession);
    },
    async create(session) {
      record('sessions.create');
      const stored = copySession(session);
      sessions = [...sessions, stored];
      return stored;
    },
    async confirmSet(sessionId, exerciseSessionId, set: SetRecord) {
      record('sessions.confirmSet');
      const session = find(sessionId);
      const exercise = session.exercises.find((candidate) => candidate.id === exerciseSessionId);
      if (exercise === undefined) {
        throw new Error(`fake storage: ${exerciseSessionId} is not part of ${sessionId}`);
      }
      const last = exercise.sets.reduce((highest, row) => Math.max(highest, row.index), 0);
      if (set.index !== last + 1) {
        throw new Error(`fake storage: set index ${set.index} does not extend the list`);
      }

      const next: WorkoutSession = {
        ...session,
        status: session.status === 'scheduled' ? 'inProgress' : session.status,
        startedAt: session.startedAt ?? set.confirmedAt,
        exercises: session.exercises.map((candidate) =>
          candidate.id === exerciseSessionId
            ? { ...candidate, status: 'active', usedWeightKg: set.weightKg, sets: [...candidate.sets, set] }
            : candidate,
        ),
      };
      replace(next);
      return next;
    },
    async recordDecision(input: LoadDecisionInput): Promise<LoadDecisionRecord> {
      record('sessions.recordDecision');
      const owner = sessions.find((session) =>
        session.exercises.some((exercise) => exercise.id === input.exerciseSessionId),
      );
      if (owner === undefined) throw new Error('fake storage: no session owns that exercise');
      const exercise = owner.exercises.find((candidate) => candidate.id === input.exerciseSessionId);
      if (exercise === undefined) throw new Error('fake storage: exercise not found');
      if (exercise.decision !== null) {
        throw new Error('fake storage: a load decision is already recorded');
      }

      const usedWeightKg =
        input.decision.kind === 'accepted'
          ? input.recommendedWeightKg
          : input.decision.kind === 'manual'
            ? input.decision.kg
            : input.previousWeightKg;
      if (usedWeightKg === null) throw new Error('fake storage: no weight to record');

      const loadDeltaKg =
        input.recommendedWeightKg === null ? null : usedWeightKg - input.recommendedWeightKg;

      replace({
        ...owner,
        exercises: owner.exercises.map((candidate) =>
          candidate.id === input.exerciseSessionId
            ? {
                ...candidate,
                decision: input.decision,
                recommendedWeightKg: input.recommendedWeightKg,
                usedWeightKg,
                loadDeltaKg,
              }
            : candidate,
        ),
      });

      return {
        exerciseSessionId: input.exerciseSessionId,
        decision: input.decision,
        recommendedWeightKg: input.recommendedWeightKg,
        usedWeightKg,
        loadDeltaKg,
      };
    },
    /**
     * T5: the same three guards the repository applies — a closed session, an exercise
     * already settled and an exercise with confirmed sets all refuse the swap.
     */
    async substitute(input: SubstituteExerciseInput): Promise<ExerciseSessionState> {
      record('sessions.substitute');
      const owner = sessions.find((session) =>
        session.exercises.some((exercise) => exercise.id === input.exerciseSessionId),
      );
      if (owner === undefined) throw new Error('fake storage: no session owns that exercise');
      if (owner.status === 'completed' || owner.status === 'partial' || owner.status === 'abandoned') {
        throw new Error('fake storage: a closed session cannot substitute');
      }
      const exercise = owner.exercises.find(
        (candidate) => candidate.id === input.exerciseSessionId,
      );
      if (exercise === undefined) throw new Error('fake storage: exercise not found');
      if (exercise.sets.length > 0) {
        throw new Error('fake storage: the exercise already has confirmed sets');
      }

      const updated = {
        ...exercise,
        exerciseId: input.exerciseId,
        exerciseNameSnapshot: input.exerciseNameSnapshot,
        recommendation: null,
        decision: null,
        recommendedWeightKg: null,
        usedWeightKg: null,
        loadDeltaKg: null,
        substitutedFrom: { ...input.substitutedFrom },
      };
      replace({
        ...owner,
        exercises: owner.exercises.map((candidate) =>
          candidate.id === input.exerciseSessionId ? updated : candidate,
        ),
      });

      const { sets: _sets, ...state } = updated;
      return state;
    },
    async finish(sessionId, status, at): Promise<SessionStateChange> {      record('sessions.finish');
      const session = find(sessionId);
      const settled = status === 'completed' ? 'done' : 'skipped';
      const next: WorkoutSession = {
        ...session,
        status,
        endedAt: at,
        exercises: session.exercises.map((exercise) =>
          exercise.status === 'active'
            ? { ...exercise, status: settled as 'done' | 'skipped', completedAt: at }
            : exercise,
        ),
      };
      replace(next);
      return {
        id: next.id,
        planDayId: next.planDayId,
        dayNameSnapshot: next.dayNameSnapshot,
        scheduledDate: next.scheduledDate,
        startedAt: next.startedAt,
        endedAt: next.endedAt,
        phase: next.phase,
        status: next.status,
        exercises: next.exercises.map((exercise): ExerciseSessionState => {
          const { sets: _sets, ...state } = exercise;
          return state;
        }),
      };
    },
    async markDeletionPending(id) {
      record('sessions.markDeletionPending');
      const session = find(id);
      replace({ ...session, status: session.status });
    },
    async pendingDeletionIds() {
      record('sessions.pendingDeletionIds');
      return [];
    },
    async delete() {
      record('sessions.delete');
      unsupported('sessions.delete');
    },
  };

  const exercisesPort: StoragePort['exercises'] = {
    async all() {
      record('exercises.all');
      return [...exercises];
    },
    async byId(id) {
      record('exercises.byId');
      return exercises.find((candidate) => candidate.id === id);
    },
    async byPattern(pattern) {
      record('exercises.byPattern');
      return exercises.filter((candidate) => candidate.pattern === pattern);
    },
    async save(exercise) {
      record('exercises.save');
      exercises = [...exercises.filter((candidate) => candidate.id !== exercise.id), exercise];
    },
    async setArchived(id, archived) {
      record('exercises.setArchived');
      exercises = exercises.map((candidate) =>
        candidate.id === id ? { ...candidate, isArchived: archived } : candidate,
      );
    },
    async remove(id) {
      record('exercises.remove');
      exercises = exercises.filter((candidate) => candidate.id !== id);
    },
  };

  const planPort: StoragePort['plan'] = {
    async all(): Promise<readonly PlanDay[]> {
      record('plan.all');
      return [];
    },
    async byId() {
      record('plan.byId');
      return undefined;
    },
    async save() {
      record('plan.save');
      unsupported('plan.save');
    },
    async remove() {
      record('plan.remove');
      unsupported('plan.remove');
    },
  };

  const measurementsPort: StoragePort['measurements'] = {
    async all() {
      record('measurements.all');
      return [...measurements];
    },
    async between() {
      record('measurements.between');
      return [...measurements];
    },
    async save(measurement) {
      record('measurements.save');
      measurements.push(measurement);
    },
    async remove() {
      record('measurements.remove');
      unsupported('measurements.remove');
    },
  };

  const activitiesPort: StoragePort['activities'] = {
    async all() {
      record('activities.all');
      return [...activities];
    },
    async between() {
      record('activities.between');
      return [...activities];
    },
    async save(activity) {
      record('activities.save');
      activities.push(activity);
    },
    async remove() {
      record('activities.remove');
      unsupported('activities.remove');
    },
  };

  const profilePort: StoragePort['profile'] = {
    async read() {
      record('profile.read');
      return profile;
    },
    async save(next: UserProfile) {
      record('profile.save');
      profile = next;
    },
  };

  const metaPort: StoragePort['meta'] = {
    async readPhaseState() {
      record('meta.readPhaseState');
      return undefined;
    },
    async savePhaseState() {
      record('meta.savePhaseState');
      unsupported('meta.savePhaseState');
    },
    async readStorageAnswer() {
      record('meta.readStorageAnswer');
      return undefined;
    },
    async saveStorageAnswer() {
      record('meta.saveStorageAnswer');
      unsupported('meta.saveStorageAnswer');
    },
  };

  return {
    sessions: sessionsPort,
    exercises: exercisesPort,
    plan: planPort,
    measurements: measurementsPort,
    activities: activitiesPort,
    profile: profilePort,
    meta: metaPort,
    backup: {
      async export() {
        record('backup.export');
        return unsupported('backup.export');
      },
      validate() {
        record('backup.validate');
        return unsupported('backup.validate');
      },
      async import() {
        record('backup.import');
        return unsupported('backup.import');
      },
    },
    async open(): Promise<OpenReport> {
      record('open');
      return { state: OPEN_STATE, orphans: NO_ORPHANS };
    },
    state() {
      return OPEN_STATE;
    },
    subscribe() {
      return () => undefined;
    },
    async scanOrphans() {
      record('scanOrphans');
      return NO_ORPHANS;
    },
    async deleteAll() {
      record('deleteAll');
      return unsupported('deleteAll');
    },
    close() {
      // Nothing to close: this port owns no connection.
    },
    get calls() {
      return [...calls];
    },
    reset() {
      calls.length = 0;
    },
    stored() {
      return sessions.map(copySession);
    },
  };
}
