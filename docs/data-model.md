# Rupfit — Data Model

Status: designed, not implemented. The TypeScript below is the target shape of
`src/core`; no file exists yet. Where a type is a persistence concern, it is marked
and lives in `src/storage` instead.

The domain is unchanged in substance from the native plan: same value types, same
entities, same invariants, same recommendation normalisation, same session state
machine (spec S7). Only the storage mechanics are new, because the store is now
IndexedDB instead of SwiftData. Where a SwiftData mechanism has no equivalent, the
replacement and what is lost are named (§11) rather than glossed.

---

## 1. Principles

1. **The domain is plain data, not the stored record.** The engine and statistics
   operate on deeply `readonly` values. Flat records behind an adapter are a storage
   concern (ADR-002); the domain never imports the storage module.
2. **History is immutable evidence.** A past session records what was shown and what
   was done. Nothing recomputes it from current data.
3. **Snapshot, don't reference, what must survive.** Names, prescriptions and
   recommendations are copied into the session record (I-4).
4. **Derived values are computed, never stored** (I-6), except the two that are
   themselves evidence: `loadDeltaKg` and the frozen recommendation.
5. **Missing is not a value.** An unanswered effort question stays `null`; it is
   never coerced into "easy" or "no discomfort" (I-7).
6. **`null`, never `undefined`, for absence.** `JSON.stringify` drops `undefined`
   keys, and the backup document is JSON. One representation of absence, or the
   export silently loses fields.

---

## 2. Value types

```ts
export type Uuid = string & { readonly __brand: 'Uuid' };      // crypto.randomUUID()
export type EpochMs = number & { readonly __brand: 'EpochMs' }; // milliseconds since epoch

export const MUSCLE_GROUPS = [
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'lowerBack',
  'chest', 'shoulders', 'triceps', 'lats', 'upperBack', 'biceps', 'forearms', 'core',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MOVEMENT_PATTERNS = [
  'squat', 'hinge', 'horizontalPush', 'verticalPush',
  'horizontalPull', 'verticalPull', 'isolation', 'core',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Coarse RIR bucket. The rank matters; raw RIR is never stored. */
export const EFFORT = {
  easy: 3,      // ≥3 reps in reserve  → UI "fácil"
  correct: 2,   // 2 RIR               → UI "correcto"
  hard: 1,      // 1 RIR               → UI "duro"
  failure: 0,   // 0 RIR               → UI "fallo"
} as const;
export type Effort = keyof typeof EFFORT;
export const DISCOMFORT = {
  none: 0,      // UI "ninguna"
  mild: 1,      // UI "molestia"
  pain: 2,      // UI "dolor"
} as const;
export type Discomfort = keyof typeof DISCOMFORT;

/** Inclusive integer range, always `min <= max`. */
export interface IntRange { readonly min: number; readonly max: number }

export type MassUnit = 'kilograms' | 'pounds';        // display only (ADR-009)
export type WeightGoal = 'maintain' | 'lose' | 'gain';
export type ActivityKind = 'strength' | 'cardio' | 'other';

export type Provenance =
  | 'imported'    // arrived through the import path (a Shortcuts bridge document)
  | 'manual'      // typed by the owner
  | 'estimated';  // computed by Rupfit (e1RM, derived volume, approximations)
```

Two substitutions for the old Swift types, both mechanical:

- `Date` → `EpochMs`. An epoch number is orderable as an IndexedDB key, round-trips
  through JSON without parsing ambiguity, and cannot be accidentally mutated.
  Formatting for display is the UI's job.
- `ClosedRange<Int>` → `{ min, max }`. `{ min, max }` reads correctly in the backup
  document, where an array `[6, 10]` would need a comment.
- `Provenance.healthKit` → `Provenance.imported`. HealthKit is out of scope (ADR-0001);
  the distinction the old case carried (measured by a device vs. typed vs. computed)
  is preserved, and the only non-manual source is now the import path (§9).

`Effort` and `Discomfort` are stored as their names, and their rank is read from the
constant (`EFFORT[effort]`, lower is harder / worse). Ordering rules in the engine
stay numeric while the stored and exported value stays readable in a JSON diff.

---

## 3. Entities (domain)

```ts
export interface Exercise {
  readonly id: Uuid;
  readonly name: string;
  readonly primaryMuscle: MuscleGroup;
  readonly pattern: MovementPattern;
  readonly equipment: Equipment;
  /** Smallest reachable step on this implement, in kg. 0 means bodyweight:
   *  progression is repetitions only. */
  readonly loadIncrementKg: number;
  readonly isCustom: boolean;
  readonly isArchived: boolean;
  /** Additive 2026-11-09 (`odd/tasks/training-program.md` S4). All optional: rows and
   *  backups written before them keep loading, and the mappers default them. */
  readonly secondaryMuscles?: readonly MuscleGroup[];
  /** How to execute it, naming the machine or implement. */
  readonly description?: string;
  /** The generic movement this row is a variant of, by exercise id. */
  readonly variantOf?: string;
  /** Exercise ids that can replace it when the machine is busy: same primary muscle and
   *  same pattern, plausible equipment swap. The substitute keeps its own history. */
  readonly alternatives?: readonly string[];
}

export interface ExercisePrescription {
  readonly sets: number;
  readonly repRange: IntRange;
  readonly targetRIR: IntRange;
  readonly restSeconds: number;
  /** Prescription profile of the readaptation block table (`progression-engine.md §8`):
   *  `strength | hypertrophy | accessory | preventive`. Optional and additive: a
   *  prescription written before profiles existed falls back to the phase role and then
   *  to `hypertrophy`, so stored sessions and old backups stay valid. */
  readonly role?: BlockRole;
}

export interface SetRecord {
  readonly id: Uuid;
  /** 1-based, matches the card label "SERIE n". */
  readonly index: number;
  readonly weightKg: number;          // canonical kg, always
  readonly targetReps: number;
  readonly actualReps: number;
  readonly effort: Effort | null;     // null = unanswered  (I-7)
  readonly discomfort: Discomfort | null; // null = unanswered  (I-7)
  /** The confirmation instant, never "now". */
  readonly confirmedAt: EpochMs;
}

export type ProgressionAction =
  | 'increase' | 'hold' | 'decrease' | 'startFirstTime' | 'insufficientData';

export interface Confidence {
  readonly level: 'low' | 'medium' | 'high';
  readonly sessionsConsidered: number;
}

export interface ProgressionRecommendation {
  /** null = "you choose, we have nothing". A first-class state, not an error. */
  readonly suggestedWeightKg: number | null;
  readonly suggestedSets: number;
  readonly suggestedTargetReps: number;
  readonly action: ProgressionAction;
  readonly reason: ReasonCode;          // typed, localisable (progression-engine.md §4)
  readonly confidence: Confidence;
  readonly basedOnSessions: number;
  readonly computedAt: EpochMs;
}

export type LoadDecision =
  | { readonly kind: 'accepted' }                 // the user took the recommendation
  | { readonly kind: 'repeated' }                 // the user took the previous weight
  | { readonly kind: 'manual'; readonly kg: number }; // anything else, including mid-session edits

export type ExerciseStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface ExerciseSession {
  readonly id: Uuid;
  readonly order: number;
  readonly exerciseId: Uuid | null;         // null once the exercise is deleted (I-4)
  readonly exerciseNameSnapshot: string;
  readonly prescription: ExercisePrescription;
  readonly recommendation: ProgressionRecommendation | null; // frozen at start (I-2)
  readonly decision: LoadDecision | null;
  readonly recommendedWeightKg: number | null;
  readonly usedWeightKg: number | null;
  readonly loadDeltaKg: number | null;      // stored evidence (I-8)
  readonly sets: readonly SetRecord[];
  readonly status: ExerciseStatus;
  readonly completedAt: EpochMs | null;
}

export type TrainingPhase =
  | { readonly kind: 'readaptation'; readonly week: number } // 1...8
  | { readonly kind: 'normal' };

export type SessionStatus = 'scheduled' | 'inProgress' | 'completed' | 'partial' | 'abandoned';

export interface WorkoutSession {
  readonly id: Uuid;
  readonly planDayId: Uuid;
  readonly dayNameSnapshot: string;      // e.g. "SENTADILLA / PIERNA"
  readonly scheduledDate: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  readonly phase: TrainingPhase;
  readonly status: SessionStatus;
  readonly exercises: readonly ExerciseSession[];
}

export interface UserProfile {
  readonly id: Uuid;
  readonly displayName: string | null;
  readonly massUnit: MassUnit;           // display only
  readonly weightGoal: WeightGoal | null;
  readonly weeklyTrainingDays: number;
  readonly availableEquipment: readonly Equipment[];
  readonly autoStartRestTimer: boolean;
}

export interface BodyMeasurement {
  readonly id: Uuid;
  readonly date: EpochMs;
  readonly weightKg: number | null;
  readonly waistCm: number | null;       // P1 fields, stored from the start
  readonly chestCm: number | null;
  readonly armCm: number | null;
  readonly thighCm: number | null;
  readonly hipCm: number | null;
  readonly bodyFatPercent: number | null;
  readonly provenance: Provenance;
}

export interface ActivityRecord {
  readonly id: Uuid;
  readonly date: EpochMs;
  readonly kind: ActivityKind;           // 'strength' | 'cardio' | 'other'
  readonly durationSeconds: number;
  readonly activeEnergyKcal: number | null;
  readonly provenance: Provenance;
  /** Dedupe key for imports (I-11). Null for manual rows. */
  readonly externalSampleId: string | null;
}
```

`MassUnit` conversion lives in the UI layer. Storage is always kilograms as a
`number` (ADR-009); no domain type carries pounds.

`suggestedWeightKg` is `number | null`, matching `docs/progression-engine.md` §3 and
§5: with no history and no calibration the app says "elige un peso" instead of
inventing a number.

---

## 4. The recommendation normalisation

The brief lists `ProgressionRecommendation` as its own record with "the user's
decision" attached, while `ExerciseSession` also holds recommended and selected
weight. Those are the same fact expressed twice, and two copies of one fact drift.

**Resolution:** there is no standalone recommendation store or record.

- `ExerciseSession.recommendation` holds the immutable recommendation computed when
  the exercise session starts (ADR-005).
- `ExerciseSession.decision`, `.recommendedWeightKg`, `.usedWeightKg` and
  `.loadDeltaKg` hold what happened.
- A later change of plan, exercise configuration or body weight does not touch it.

If an audit trail of engine versions is ever needed, the addition is
`recommendation.engineVersion: string` — an additive field, not a second record.

---

## 5. Persistence: IndexedDB schema V1

### 5.1 Database, stores and keys

One database, `rupfit`, version `1`. Every store is keyed by a string UUID except
the single-row records (`profile`, `phaseState`, `storage`), which live in `meta`
under fixed string keys.

| Store | Key path | Purpose |
| --- | --- | --- |
| `meta` | `key` (`'profile'`, `'phaseState'`, `'storage'`) | single-row state and storage-persistence answer |
| `exercises` | `id` | the library, seeded plus custom |
| `planDays` | `id` | weekday template days |
| `planItems` | `id` | ordered items of a day |
| `sessions` | `id` | one row per scheduled or performed workout |
| `exerciseSessions` | `id` | one row per exercise inside a session |
| `sets` | `id` | one row per confirmed set |
| `bodyMeasurements` | `id` | body weight and measurements |
| `activities` | `id` | cardio / other activity rows |

Indexes exist for the queries the app actually makes, and nothing else:

| Store | Index | Used by |
| --- | --- | --- |
| `exercises` | `by_archived` | library list (active first) |
| `exercises` | `by_pattern` | coverage check of the seed library |
| `planDays` | `by_order` | weekday template order |
| `planItems` | `by_planDay_order` (`[planDayId, order]`) | rendering a day in order |
| `sessions` | `by_status` | "is there an `inProgress` session?" (I-9) |
| `sessions` | `by_scheduledDate` | next session on or after today |
| `exerciseSessions` | `by_session_order` (`[sessionId, order]`) | rendering a session |
| `exerciseSessions` | `by_exercise_date` (`[exerciseId, sessionDate]`) | engine history for one exercise, newest first |
| `sets` | `by_exerciseSession_index` (`[exerciseSessionId, index]`) | reading a set list; the last confirmed set drives the rest timer |
| `bodyMeasurements` | `by_date` | weight series and 7-day window |
| `activities` | `by_date` | weekly activity list |
| `activities` | `by_externalSampleId` (unique) | import dedupe (I-11) |

`RupfitDb` — the `DBSchema` declaration used by `idb` — is derived from these two
tables and is a compile-time description only. The browser enforces none of it:
neither key types nor index presence. That is why every record read back is
validated at the boundary (§11).

Two consequences worth writing down, because they are where the schema stops being
free:

- **There are no joins.** `by_exercise_date` exists because the engine asks "this
  exercise's history, newest first" and the date lives on the parent session.
  `ExerciseSessionRecord` therefore carries a denormalised copy of `sessionDate`.
  It is written once, when the session is created; a scheduled session whose date
  changes is rewritten, which is the only thing that ever moves it.
- **A unique index skips records whose key is missing.** `by_externalSampleId` is
  unique, and rows without `externalSampleId` are simply not in the index — so
  manual activities can share a store with imported ones without colliding. That is
  the mechanism behind I-11, not a database constraint.

### 5.2 Records are flat, and the mappers are the boundary

The stored shape is not the domain shape. Records are flat, denormalised and carry
the raw field names IndexedDB can index; mappers convert both ways and are tested in
both directions.

```ts
// src/storage/records.ts (excerpt)
export interface SetRecordRow {
  id: Uuid;
  exerciseSessionId: Uuid;      // the parent reference
  sessionId: Uuid;              // denormalised for session-level reads
  index: number;
  weightKg: number;
  targetReps: number;
  actualReps: number;
  effort: Effort | null;
  discomfort: Discomfort | null;
  confirmedAt: EpochMs;
}

export interface ExerciseSessionRow {
  id: Uuid;
  sessionId: Uuid;
  sessionDate: EpochMs;         // denormalised: index by_exercise_date
  order: number;
  exerciseId: Uuid | null;
  exerciseNameSnapshot: string;
  prescription: ExercisePrescription;    // stored as a nested object: never queried
  recommendation: ProgressionRecommendation | null;
  decision: LoadDecision | null;
  recommendedWeightKg: number | null;
  usedWeightKg: number | null;
  loadDeltaKg: number | null;
  status: ExerciseStatus;
  completedAt: EpochMs | null;
}
```

Nested values (`prescription`, `recommendation`) are stored whole because they are
read and written with their parent and never queried by field. Flattening them
would create columns no index uses and a second place for the frozen recommendation
to be edited.

### 5.3 Opening, versioning and migration

```ts
export const DB_NAME = 'rupfit';
export const DB_VERSION = 1;

export function openDatabase(): Promise<IDBPDatabase<RupfitDb>> {
  return openDB<RupfitDb>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        // create every store and index of §5.1
      }
      // if (oldVersion < 2) { /* additive step only; copy within this transaction */ }
    },
    blocked() {
      // another context still holds the old version: surface `persistence:'blocked'`,
      // never force it, never delete the database
    },
    blocking() {
      // close this connection so the other context can upgrade; reopen on next use
    },
    terminated() {
      // the browser killed the connection: discard in-memory state, reopen lazily
    },
  });
}
```

**Migration policy (ADR-011):** additive only, and the version exists from the first
release even while it has one step. New optional fields, new stores and new string
union members are safe; nothing needs a copy. Renaming a field, changing a type or
deleting a store requires a new `DB_VERSION` and an explicit copy step *inside the
upgrade transaction*, so the cheapest possible failure is a rollback rather than a
half-migrated store. Never a destructive migration, never a "just delete the
database and start over" fallback: this database is the owner's only training
history.

Migration failure behaviour: the app opens read-only, shows what is readable, offers
an export, disables writes with an explanation. It does not attempt repair.

### 5.4 Transactions: what is atomic, and what "saved" means

| Operation | Stores in the transaction | Guard inside the transaction |
| --- | --- | --- |
| Confirm a set | `sets`, `exerciseSessions`, `sessions` | set index must extend the existing list; `pending`/`active` only |
| Start a session (first set) | `sessions`, `exerciseSessions` | at most one `inProgress` session (I-9) |
| Record a load decision | `exerciseSessions` | the decision is written once; `loadDeltaKg` computed here (I-8) |
| Finish a session | `sessions`, `exerciseSessions` | terminal status only from `inProgress` |
| Delete a session | `sessions`, `exerciseSessions`, `sets` | explicit confirmation; cascades by hand (I-1) |
| Import a document | every store the document touches | validation completed before the transaction opens; replace clears and writes in one transaction |
| Read statistics | `sets`, `exerciseSessions` (`readonly`) | no writes, ever |

- **The commit point is `IDBTransaction.complete`.** IndexedDB does not promise that
  a completed transaction has reached the disk: the `durability: 'strict'` option is
  not consistently implemented (architecture §2.2 P-15). The app treats `complete`
  as "durable enough" and states it plainly: a confirmed set survives a reload, a
  killed tab and a relaunch; it is not guaranteed to survive a hard reset one
  millisecond after the tap. That is the honest limit of browser storage, and it is
  why the export exists.
- **Await-then-render (I-12).** The UI reports a set as confirmed only after
  `tx.done` resolves. If the transaction aborts — quota, closed connection, a guard
  rejecting the write — the set stays unconfirmed and the retry banner appears. The
  app never reports a success it did not persist.
- **Serialisation across contexts.** IndexedDB runs transactions over the same
  object stores in creation order, across connections. A Safari tab and the
  installed app are therefore serialised against each other on `sessions`, which is
  what makes the I-9 guard inside one transaction safe without a lock.
- **No `beforeunload` saving.** Nothing is flushed on the way out, because nothing
  is pending: every confirmed set is already committed. A kill at any moment costs
  at most the set in progress.

### 5.5 What a crash costs

| Moment of the kill | Result on relaunch |
| --- | --- |
| Before the first set is confirmed | No session row moved to `inProgress`; the scheduled session is untouched |
| While typing a weight in the edit field | The edit is unsaved; the set list is intact |
| After tapping confirm, before commit | The set is not confirmed; the row shows unconfirmed and can be retried |
| After commit | The set is there, `confirmedAt` is exact, the rest timer is derived correctly |
| Mid-session, later | The `inProgress` session is offered as *resume* or *finish as partial* (§7) |

---

## 6. Invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| I-1 | A `SetRecord` never exists without an `ExerciseSession`; deleting a session removes its sets in the same transaction, never orphans them | one transactional delete routine, plus an orphan scan in the open sequence and a test |
| I-2 | A stored recommendation is never recomputed; later data cannot change it | no write path for `recommendation` after creation; mapper test |
| I-3 | All stored masses are kilograms | the types have no unit field |
| I-4 | History survives exercise rename, archive or delete (name snapshot, nullable id) | mapper + test |
| I-5 | A session with at least one confirmed set cannot disappear silently; deletion is explicit | a `deletionPending` flag committed first, removal only after typed confirmation |
| I-6 | Volume, e1RM, PRs and weekly means are computed, never stored | no aggregate store exists; statistics are pure functions; schema test asserts no such store |
| I-7 | Unanswered effort/discomfort is `null`; it is never defaulted | nullable fields, exhaustive UI states, schema rejects a nulled-out record on import |
| I-8 | `loadDeltaKg === usedWeightKg − recommendedWeightKg` at decision time, stored | written once, in the same transaction as the decision |
| I-9 | At most one session in `inProgress` at a time | guard inside one `readwrite` transaction over `sessions` (serialised across contexts) |
| I-10 | A `BodyMeasurement` carries at least one non-nil measure | validation before save, in the repository |
| I-11 | Re-importing the same bridge sample never creates a duplicate | unique index on `externalSampleId` + upsert in the import transaction |
| I-12 | Confirming a set is persisted before the UI reports it confirmed | await `tx.done`, then render |

Two invariants had to change *mechanism* and not meaning:

- **I-1** was a cascade rule in the schema. IndexedDB has no cascades, so it is now
  a single transactional delete routine, an orphan scan on open (report the count,
  never auto-delete), and a test that deletes a session and asserts zero orphaned
  rows. The invariant is the same; the enforcer is code instead of a database.
- **I-11** was a unique property on the entity. IndexedDB has no unique constraint
  other than a unique index, so the enforcer is a unique index on
  `externalSampleId` plus an upsert-by-index inside the import transaction.

---

## 7. Session state machine and crash recovery

```
scheduled ──start──► inProgress ──finish(all done)──► completed
                          │
                          ├──finish(partial)──► partial
                          └──discard──────────► abandoned
```

- The transition to `inProgress` happens when the first set is confirmed, not when
  the screen opens: opening the plan tomorrow must not create a session.
- The transition is attempted inside one transaction that first checks `by_status`
  for an existing `inProgress` session. If one exists, the write aborts with
  `conflict` and the UI offers resume instead (I-9). This covers the case of the app
  being open in a Safari tab and as an installed app at the same time.
- On launch, any `inProgress` session is offered as *resume* or *finish as partial*.
  It is never auto-completed, never auto-deleted (FR-6.6). Startup does not need a
  journal: the session row is the journal.
- **The rest timer is not stored as a countdown.** The store keeps `confirmedAt` of
  the last set plus `restSeconds`; the remaining time is derived from the injected
  clock. That is what makes the timer survive backgrounding, screen lock and
  relaunch (FR-8.4) without a background task, a notification, or even a running
  interval — a PWA cannot rely on timers while backgrounded (architecture §2.2 P-4).
- Each confirmed set is written in its own transaction, so a crash costs at most the
  set in progress.
- The state machine is a pure transition table in `src/core/session`, tested in
  Node. The UI store applies the returned effects; it does not decide transitions.

---

## 8. Derived values

| Value | Formula | Notes |
| --- | --- | --- |
| Session volume | `Σ weightKg × actualReps` over confirmed sets | Bodyweight exercises contribute 0 kg·reps; rep count is still reported. Stated in the UI as "volumen levantado" |
| Weekly volume per muscle | sum of *hard sets* (effort ≤ 1 RIR) per `primaryMuscle`, 7-day window | Matches `training-science.md` §4 |
| e1RM | `weightKg × (1 + (actualReps + rir) / 30)` (Epley, RIR-adjusted), `formulaVersion = 1` | Display only, labelled "estimación"; suppressed when `actualReps + rir > 12` |
| 7-day body-weight mean | mean of available daily values in the window | Needs ≥ 3 samples in the window, otherwise the chart shows gaps rather than a misleading line |
| Personal record | max `weightKg` for an exercise at a given target rep count | Ties broken by `confirmedAt` |

Every one of these is a pure function in `src/core/statistics` with fixtures in
`*.test.ts`. `e1RM` carries its formula version so a future change is comparable
rather than silent.

The statistics story for IndexedDB, in full:

- Nothing is precomputed. There is no aggregate store, no summary row, no cached
  weekly total — a cache would be a second copy of a fact and would drift (I-6).
- Each statistic is computed from a range read over an index: a session summary
  reads `exerciseSessions` by `by_session_order`, then one `sets` range per exercise
  session; the weight chart reads `by_date` over a window; per-exercise strength
  history reads `by_exercise_date`.
  A twelve-week window is a few hundred rows, which is a cursor pass measured in
  microseconds on the owner's phone.
- Memoisation is per render pass only. Lifting it into storage is the change that
  I-6 forbids, and the test that asserts no aggregate store exists is what keeps
  that honest.
- If a statistic ever becomes too slow to compute on demand (a multi-year history
  is the plausible trigger), the answer is a projection store with a documented
  derivation rule and a rebuild path — a decision with an ADR, not a silent cache.

---

## 9. Backup document

`FR-16.3` requires a full, user-owned export; `S5` makes it the recovery path for a
lost storage container.

```json
{
  "documentType": "rupfit.backup",
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-11-08T10:00:00Z",
  "profile": { },
  "phaseState": { },
  "exercises": [ ],
  "planDays": [ ],
  "sessions": [ ],
  "bodyMeasurements": [ ],
  "activities": [ ]
}
```

Rules:

- The document is the domain objects encoded as-is, with `null` for absence. It is
  the only interchange format; there is no second one.
- Export never includes anything beyond the domain: no storage internals, no
  IndexedDB rows, no device identifiers. Rows that arrived through the import path
  carry `externalSampleId` so re-import can dedupe (I-11).
- **Validation before writing.** The document is parsed with the `zod` schema derived
  from the domain types. An invalid document changes nothing and reports the first
  failure with its path (`sessions[3].exercises[0].sets[1].effort`), not a generic
  "import failed".
- An unknown `schemaVersion` is rejected with both versions named. No best-effort
  parse, no partial import.
- **Two import modes, both explicit:**

  | Mode | Semantics | Allowed for |
  | --- | --- | --- |
  | `restore` | Replace the whole store: clear and write in one transaction, after a typed confirmation | A full `rupfit.backup` document |
  | `merge` | Upsert by `id`, and by `externalSampleId` where present; never deletes | `activities` and `bodyMeasurements` only |

  `merge` exists because the optional Shortcuts bridge (architecture §10.1) must add
  activity and measurement rows without touching training history. Replace semantics
  for a bridge import would be a data-loss bug wearing an import dialog.
- The whole import is one transaction: a crash mid-import leaves the previous store
  intact, not half-replaced.
- Export path on iOS: a `Blob` download first, the share sheet with the file second,
  and copy-to-clipboard as the last resort. Which of the three works inside a
  standalone web app on the owner's iOS version is uncertain and is measured in F5
  (architecture §2.2 P-10). At least one of the three must work, and the checklist
  records which.

---

## 10. Deletion

`Perfil → Borrar todos los datos` deletes the database, clears any in-memory state
and resets the phase to `readaptation(week: 1)`. There is no soft-delete path: the
owner asked for it gone, so it is gone. This is the only destructive operation in
the app and it requires a typed confirmation (FR-16.4).

Mechanically: mark the operation, close open connections, `deleteDatabase`, reopen
empty and reseed the exercise library. If the delete is blocked by another open
context (the Safari tab), the app reports it and asks for the other context to be
closed rather than forcing it — the same `blocked` path as a version upgrade.

---

## 11. What the store does not give us

Named once, because each of these is a place where a bug is more likely than it was
under SwiftData, and each has a named owner in the design.

| Lost or missing | Replacement | Residual risk |
| --- | --- | --- |
| Cascade deletes and referential integrity | one transactional delete routine plus an orphan scan on open (I-1) | a future write path that forgets the routine; the orphan scan and the delete test are the guard |
| A typed schema enforced by the store | compile-time `DBSchema` in `idb` (types only) plus `zod` on the import boundary and on records read back | a malformed row hand-edited into storage is caught at read time, not at write time |
| A query language (predicates, sort, join) | indexes designed for the queries the app actually makes (§5.1) plus denormalised `sessionDate` | a new statistic may need a new index; an index change is a migration step |
| Automatic cross-device sync | none. The export document is the migration path (§9, roadmap F6) | moving to a new phone is a manual step the owner must remember; stated as a cost in ADR-0001 |
| Automatic migration recovery | versioned steps, export-before-migrate, read-only fallback on failure | a broken migration step is discovered on the owner's only device; it is tested with a fixture store first |
| Durable commit (`fsync`-equivalent) | treat `complete` as the commit point, state the limit (§5.4) | an OS-level crash immediately after a tap can lose the last set; not mitigable from the browser |
| Storage that the app owns | install to the Home Screen, and export (architecture §2.3). `navigator.storage.persist()` is absent in WebKit, so there is nothing to request | eviction is a browser decision; the export is the only true backup |
| Backup on uninstall | none: uninstalling the web app deletes the container | the export is the only backup, and the install/backup explanation in `Perfil` says so in one sentence |

---

## 12. Open questions for F3–F6

| # | Question | Default if unresolved |
| --- | --- | --- |
| Q-1 | Should `ExerciseSession.recommendation` store the engine version that produced it? | No in v1; additive later |
| Q-2 | Should plan edits rewrite future scheduled sessions that already hold a frozen recommendation? | No: a started session is frozen; future ones are regenerated |
| Q-3 | Multi-device sync | Out of scope. It would need a backend, which S5 and FR-16 forbid; the export document is the migration path |
| Q-4 | Should the app keep probing `navigator.storage.persist()` on every launch? | Probe once per launch at most, record the answer, never prompt. WebKit does not implement it today (architecture §2.2 P-8), so the answer is a no-op until it does |
| Q-5 | Orphan rows found by the open-time scan: report only, or offer a repair action? | Report only until F5 has fixtures proving the delete routine is sound |
