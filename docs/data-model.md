# Rupfit — Data Model

Status: implemented. §2–§3 values and entities live in `RupfitCore` (F3); the
persistence schema of §5, its mappers and the backup document of §9 live in
`App/RupfitPersistence` (F4, 2026-11-08).

---

## 1. Principles

1. **The domain is structs, not `@Model`.** The engine and statistics operate on
   plain `Sendable` values. SwiftData classes are a storage adapter (ADR-002).
2. **History is immutable evidence.** A past session records what was shown and
   what was done. Nothing recomputes it from current data.
3. **Snapshot, don't reference, what must survive.** Names, prescriptions and
   recommendations are copied into the session record (I-4).
4. **Derived values are computed, never stored** (I-6), except the two that are
   themselves evidence: `loadDeltaKg` and the frozen recommendation.
5. **Missing is not a value.** An unanswered effort question stays `nil`; it is
   never coerced into "easy" or "no discomfort" (I-7).

---

## 2. Value types

```swift
public enum MuscleGroup: String, Sendable, CaseIterable {
    case quadriceps, hamstrings, glutes, calves, lowerBack
    case chest, shoulders, triceps, lats, upperBack, biceps, forearms, core
}

public enum MovementPattern: String, Sendable, CaseIterable {
    case squat, hinge, horizontalPush, verticalPush
    case horizontalPull, verticalPull, isolation, core
}

public enum Equipment: String, Sendable, CaseIterable {
    case barbell, dumbbell, machine, cable, bodyweight, band
}

/// Effort is a coarse RIR bucket. Ordering matters; raw RIR is not stored.
public enum Effort: Int, Sendable, CaseIterable {
    case easy = 3       // ≥3 reps in reserve   → UI "fácil"
    case correct = 2    // 2 RIR                → UI "correcto"
    case hard = 1       // 1 RIR                → UI "duro"
    case failure = 0    // 0 RIR                → UI "fallo"
}

public enum Discomfort: Int, Sendable, CaseIterable {
    case none = 0       // UI "ninguna"
    case mild = 1       // UI "molestia"
    case pain = 2       // UI "dolor"
}
```

`ClosedRange<Int>` is used for rep ranges and is `Codable` and `Sendable` when its
bound is; it is the one standard-library type allowed to appear in the domain API.

---

## 3. Entities (domain)

```swift
public struct Exercise: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var name: String
    public var primaryMuscle: MuscleGroup
    public var pattern: MovementPattern
    public var equipment: Equipment
    /// Smallest reachable step on this implement, in kg. 0 means bodyweight:
    /// progression is repetitions only.
    public var loadIncrementKg: Double
    public var isCustom: Bool
    public var isArchived: Bool
}

public struct ExercisePrescription: Hashable, Sendable {
    public var sets: Int
    public var repRange: ClosedRange<Int>
    public var targetRIR: ClosedRange<Int>
    public var restSeconds: Int
}

public struct SetRecord: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let index: Int              // 1-based, matches the card label "SERIE n"
    public var weightKg: Double        // canonical kg, always
    public var targetReps: Int
    public var actualReps: Int
    public var effort: Effort?         // nil = unanswered  (I-7)
    public var discomfort: Discomfort? // nil = unanswered  (I-7)
    public let confirmedAt: Date       // the confirmation instant, not "now"
}

public enum ProgressionAction: String, Sendable {
    case increase, hold, decrease, startFirstTime, insufficientData
}

public struct ProgressionRecommendation: Hashable, Sendable {
    public let suggestedWeightKg: Double
    public let suggestedSets: Int
    public let suggestedTargetReps: Int
    public let action: ProgressionAction
    public let reason: ReasonCode        // typed, localisable (see progression-engine.md)
    public let confidence: Confidence
    public let basedOnSessions: Int
    public let computedAt: Date
}

public struct Confidence: Hashable, Sendable {
    public enum Level: String, Sendable { case low, medium, high }
    public let level: Level
    public let sessionsConsidered: Int
}

public enum LoadDecision: Hashable, Sendable {
    case accepted                  // the user took the recommendation
    case repeated                  // the user took the previous weight
    case manual(kg: Double)        // anything else, including mid-session edits
}

public struct ExerciseSession: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let order: Int
    public let exerciseID: UUID?         // nil once the exercise is deleted (I-4)
    public let exerciseNameSnapshot: String
    public let prescription: ExercisePrescription
    public let recommendation: ProgressionRecommendation?  // frozen at start (I-2)
    public var decision: LoadDecision?
    public var recommendedWeightKg: Double?
    public var usedWeightKg: Double?
    public var loadDeltaKg: Double?      // stored evidence (I-8)
    public var sets: [SetRecord]
    public var status: ExerciseStatus
    public var completedAt: Date?
}

public enum ExerciseStatus: String, Sendable { case pending, active, done, skipped }

public enum TrainingPhase: Hashable, Sendable {
    case readaptation(week: Int)   // 1...8
    case normal
}

public struct WorkoutSession: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let planDayID: UUID
    public let dayNameSnapshot: String    // e.g. "SENTADILLA / PIERNA"
    public let scheduledDate: Date
    public var startedAt: Date?
    public var endedAt: Date?
    public var phase: TrainingPhase
    public var status: SessionStatus
    public var exercises: [ExerciseSession]
}

public enum SessionStatus: String, Sendable {
    case scheduled, inProgress, completed, partial, abandoned
}

public struct UserProfile: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var displayName: String?
    public var massUnit: MassUnit          // .kilograms | .pounds (display only)
    public var weightGoal: WeightGoal?     // .maintain | .lose | .gain
    public var weeklyTrainingDays: Int
    public var availableEquipment: Set<Equipment>
    public var autoStartRestTimer: Bool
}

public struct BodyMeasurement: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var date: Date
    public var weightKg: Double?
    public var waistCm: Double?            // P1 fields, stored from the start
    public var chestCm: Double?
    public var armCm: Double?
    public var thighCm: Double?
    public var hipCm: Double?
    public var bodyFatPercent: Double?
    public var provenance: Provenance
}

public struct ActivityRecord: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var date: Date
    public var kind: ActivityKind          // .strength, .cardio, .other
    public var durationSeconds: Int
    public var activeEnergyKcal: Double?
    public var provenance: Provenance
    public var healthKitSampleID: UUID?    // dedupe key for imports
}

public enum Provenance: String, Sendable {
    case healthKit      // measured, read from Health
    case manual         // typed by the user
    case estimated      // computed by Rupfit (e1RM, derived volume, approximations)
}
```

`MassUnit` conversion lives in the UI layer. Storage is always `Double` kilograms
(ADR-009); no domain type carries pounds.

---

## 4. The recommendation normalisation

The brief lists `ProgressionRecommendation` as its own record with "the user's
decision" attached, while `ExerciseSession` also holds recommended and selected
weight. Those are the same fact expressed twice, and two copies of one fact drift.

**Resolution:** there is no standalone recommendation record.

- `ExerciseSession.recommendation` holds the immutable recommendation computed when
  the exercise session starts (ADR-005).
- `ExerciseSession.decision`, `.recommendedWeightKg`, `.usedWeightKg` and
  `.loadDeltaKg` hold what happened.
- A later change of plan, exercise configuration or body weight does not touch it.

If an audit trail of engine versions is ever needed, the addition is
`recommendation.engineVersion: String` — an additive field, not a second record.

---

## 5. Persistence schema (SchemaV1)

Entities are denormalised for query convenience; mappers convert both ways.

| Entity | Key fields | Relationship |
| --- | --- | --- |
| `UserProfileEntity` | `id`, units, goal, flags | single row |
| `ExerciseEntity` | `id`, name, muscle, pattern, equipment, `loadIncrementKg`, `isCustom`, `isArchived` | — |
| `PlanDayEntity` | `id`, name, weekday index, order | `items` → `PlanItemEntity` (cascade) |
| `PlanItemEntity` | `id`, order, `exerciseID`, sets, repLower, repUpper, rirLower, rirUpper, restSeconds | → `PlanDayEntity` |
| `WorkoutSessionEntity` | `id`, `planDayID`, `dayNameSnapshot`, `scheduledDate`, `startedAt`, `endedAt`, `phaseRaw`, `statusRaw` | `exercises` → `ExerciseSessionEntity` (cascade) |
| `ExerciseSessionEntity` | `id`, `order`, `exerciseID`, `exerciseNameSnapshot`, prescription fields, recommendation fields, `decisionRaw`, `recommendedWeightKg`, `usedWeightKg`, `loadDeltaKg`, `statusRaw` | `sets` → `SetRecordEntity` (cascade) |
| `SetRecordEntity` | `id`, `index`, `weightKg`, `targetReps`, `actualReps`, `effortRaw`, `discomfortRaw`, `confirmedAt` | → `ExerciseSessionEntity` |
| `BodyMeasurementEntity` | `id`, `date`, all measures, `provenanceRaw` | — |
| `ActivityRecordEntity` | `id`, `date`, `kindRaw`, `durationSeconds`, `activeEnergyKcal`, `provenanceRaw`, `healthKitSampleID` | unique on `healthKitSampleID` |
| `PhaseStateEntity` | `currentPhaseRaw`, `readaptationWeek`, `blockPassedCount`, `startedAt` | single row |

```swift
enum RupfitSchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { /* entities above */ }
}

enum RupfitMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [RupfitSchemaV1.self] }
    static var stages: [MigrationStage] { [] }
}
```

**Migration policy (ADR-011):** additive only. New optional properties, new
entities, and new raw enum cases are safe. Renaming or deleting a property requires
`SchemaV2` plus a `custom` stage that copies data explicitly. Never a destructive
migration, never a "just delete the store" fallback: the store is the user's only
training history.

---

## 6. Invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| I-1 | A `SetRecord` never exists without an `ExerciseSession`; deleting a session cascades, never orphans | cascade rule + a test |
| I-2 | A stored recommendation is never recomputed; later data cannot change it | no mutating API on the field after start |
| I-3 | All stored masses are kilograms | type has no unit field |
| I-4 | History survives exercise rename, archive or delete (name snapshot, nullable id) | mapper + test |
| I-5 | A session with at least one confirmed set cannot disappear silently; deletion is explicit | delete API keeps a tombstone until confirmed |
| I-6 | Volume, e1RM, PRs and weekly means are computed, never stored | statistics are pure functions |
| I-7 | Unanswered effort/discomfort is `nil`; it is never defaulted | optional fields, exhaustive UI states |
| I-8 | `loadDeltaKg == usedWeightKg - recommendedWeightKg` at decision time, stored | written once with the decision |
| I-9 | At most one session in `inProgress` at a time | transition guard + test |
| I-10 | A `BodyMeasurement` carries at least one non-nil measure | validation before save |
| I-11 | Re-importing the same HealthKit sample never creates a duplicate | unique `healthKitSampleID` + upsert |
| I-12 | Confirming a set is persisted before the UI reports it confirmed | await-then-render |

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
- On launch, any `inProgress` session is offered as *resume* or *finish as partial*.
  It is never auto-completed, never auto-deleted (FR-6.6).
- **The rest timer is not stored as a countdown.** The store keeps `confirmedAt` of
  the last set plus `restSeconds`; the remaining time is derived from the injected
  clock. That is what makes the timer survive backgrounding and relaunch (FR-8.4)
  without a background task or a notification.
- Each confirmed set is written in its own transaction, so a crash costs at most
  the set in progress.

---

## 8. Derived values

| Value | Formula | Notes |
| --- | --- | --- |
| Session volume | `Σ weightKg × actualReps` over confirmed sets | Bodyweight exercises contribute 0 kg·reps; rep count is still reported. Stated in the UI as "volumen levantado" |
| Weekly volume per muscle | sum of *hard sets* (effort `correct`, `hard` or `failure`, i.e. ≤2 RIR) per `primaryMuscle`, 7-day window | Matches `training-science.md` §4; `easy` and unanswered are excluded |
| e1RM | `weightKg × (1 + (actualReps + rir)/30)` (Epley, RIR-adjusted), `formulaVersion = 1` | Display only, labelled "estimación"; suppressed when `actualReps + rir > 12` |
| 7-day body-weight mean | mean of available daily values in the window | Needs ≥ 3 samples in the window, otherwise the chart shows gaps rather than a misleading line |
| Personal record | max `weightKg` for an exercise at a given target rep count | Ties broken by `confirmedAt` |

Every one of these is a pure function in `RupfitCore/Statistics` with fixtures in
`Tests/RupfitCoreTests`. `e1RM` carries its formula version so a future change is
comparable rather than silent.

---

## 9. Backup document

`FR-16.3` requires a full, user-owned export.

```json
{
  "documentType": "rupfit.backup",
  "schemaVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-11-08T10:00:00Z",
  "profile": { },
  "exercises": [ ],
  "planDays": [ ],
  "sessions": [ ],
  "bodyMeasurements": [ ],
  "activities": [ ]
}
```

Rules: the document is the domain structs encoded as-is; export never includes
HealthKit-identifying data beyond the sample UUID used for dedupe; import validates
the whole document before touching the store and, in the MVP, **replaces** the
store only after an explicit confirmation (no silent merge). An invalid document
changes nothing (architecture §9).

---

## 10. Deletion

`Perfil → Borrar todos los datos` deletes the container files, clears any in-memory
state and resets the phase to `.readaptation(week: 1)`. There is no soft-delete
path: the user asked for it gone, so it is gone. This is the only destructive
operation in the app and it requires a typed confirmation (FR-16.4).

---

## 11. Open questions for F0–F4

| # | Question | Default if unresolved |
| --- | --- | --- |
| Q-1 | Should `ExerciseSession` store the engine version that produced the recommendation? | No in v1; additive later |
| Q-2 | Should plan edits rewrite future scheduled sessions that already hold a frozen recommendation? | No: a started session is frozen; future ones are regenerated |
| Q-3 | Multi-device sync | Out of scope; the export document is the migration path |
