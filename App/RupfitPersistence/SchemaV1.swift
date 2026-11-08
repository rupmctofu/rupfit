import Foundation
import SwiftData
import RupfitCore

/// SchemaV1 is registered from the first release with an empty migration plan, so
/// adding a version later is a stage, not a data-loss incident (architecture.md §5).
public enum SchemaV1: VersionedSchema {
    public static var versionIdentifier = Schema.Version(1, 0, 0)

    public static var models: [any PersistentModel.Type] {
        [
            UserProfileEntity.self,
            ExerciseEntity.self,
            PlanDayEntity.self,
            PlanItemEntity.self,
            WorkoutSessionEntity.self,
            ExerciseSessionEntity.self,
            SetRecordEntity.self,
            PhaseStateEntity.self,
            BodyMeasurementEntity.self,
            ActivityRecordEntity.self,
        ]
    }

    @Model
    public final class UserProfileEntity {
        @Attribute(.unique) public var id: UUID
        public var displayName: String?
        public var massUnitRaw: String
        public var weightGoalRaw: String?
        public var weeklyTrainingDays: Int
        public var equipmentRaw: [String]
        public var autoStartRestTimer: Bool

        public init(id: UUID, displayName: String?, massUnitRaw: String, weightGoalRaw: String?,
                    weeklyTrainingDays: Int, equipmentRaw: [String], autoStartRestTimer: Bool) {
            self.id = id
            self.displayName = displayName
            self.massUnitRaw = massUnitRaw
            self.weightGoalRaw = weightGoalRaw
            self.weeklyTrainingDays = weeklyTrainingDays
            self.equipmentRaw = equipmentRaw
            self.autoStartRestTimer = autoStartRestTimer
        }
    }

    @Model
    public final class ExerciseEntity {
        @Attribute(.unique) public var id: UUID
        public var name: String
        public var primaryMuscleRaw: String
        public var patternRaw: String
        public var equipmentRaw: String
        public var loadIncrementKg: Double
        public var isCustom: Bool
        public var isArchived: Bool

        public init(id: UUID, name: String, primaryMuscleRaw: String, patternRaw: String,
                    equipmentRaw: String, loadIncrementKg: Double, isCustom: Bool, isArchived: Bool) {
            self.id = id
            self.name = name
            self.primaryMuscleRaw = primaryMuscleRaw
            self.patternRaw = patternRaw
            self.equipmentRaw = equipmentRaw
            self.loadIncrementKg = loadIncrementKg
            self.isCustom = isCustom
            self.isArchived = isArchived
        }
    }

    @Model
    public final class PlanDayEntity {
        @Attribute(.unique) public var id: UUID
        public var name: String
        public var weekday: Int
        public var order: Int
        @Relationship(deleteRule: .cascade, inverse: \PlanItemEntity.day)
        public var items: [PlanItemEntity] = []

        public init(id: UUID, name: String, weekday: Int, order: Int) {
            self.id = id
            self.name = name
            self.weekday = weekday
            self.order = order
        }
    }

    @Model
    public final class PlanItemEntity {
        @Attribute(.unique) public var id: UUID
        public var order: Int
        public var exerciseID: UUID
        public var plannedSets: Int
        public var repLower: Int
        public var repUpper: Int
        public var rirLower: Int
        public var rirUpper: Int
        public var restSeconds: Int
        public var day: PlanDayEntity?

        public init(id: UUID, order: Int, exerciseID: UUID, plannedSets: Int,
                    repLower: Int, repUpper: Int, rirLower: Int, rirUpper: Int, restSeconds: Int) {
            self.id = id
            self.order = order
            self.exerciseID = exerciseID
            self.plannedSets = plannedSets
            self.repLower = repLower
            self.repUpper = repUpper
            self.rirLower = rirLower
            self.rirUpper = rirUpper
            self.restSeconds = restSeconds
        }
    }

    @Model
    public final class WorkoutSessionEntity {
        @Attribute(.unique) public var id: UUID
        public var planDayID: UUID
        public var dayNameSnapshot: String
        public var scheduledDate: Date
        public var startedAt: Date?
        public var endedAt: Date?
        public var phaseKindRaw: String
        public var phaseWeek: Int?
        public var statusRaw: String
        @Relationship(deleteRule: .cascade, inverse: \ExerciseSessionEntity.session)
        public var exercises: [ExerciseSessionEntity] = []

        public init(id: UUID, planDayID: UUID, dayNameSnapshot: String, scheduledDate: Date,
                    startedAt: Date?, endedAt: Date?, phaseKindRaw: String, phaseWeek: Int?,
                    statusRaw: String) {
            self.id = id
            self.planDayID = planDayID
            self.dayNameSnapshot = dayNameSnapshot
            self.scheduledDate = scheduledDate
            self.startedAt = startedAt
            self.endedAt = endedAt
            self.phaseKindRaw = phaseKindRaw
            self.phaseWeek = phaseWeek
            self.statusRaw = statusRaw
        }
    }

    @Model
    public final class ExerciseSessionEntity {
        @Attribute(.unique) public var id: UUID
        public var order: Int
        public var exerciseID: UUID?
        public var exerciseNameSnapshot: String
        public var plannedSets: Int
        public var repLower: Int
        public var repUpper: Int
        public var rirLower: Int
        public var rirUpper: Int
        public var restSeconds: Int

        // Frozen recommendation (I-2): written once at session start.
        public var recWeightKg: Double?
        public var recSets: Int?
        public var recTargetReps: Int?
        public var recActionRaw: String?
        public var recReasonRaw: String?
        public var recConfidenceRaw: String?
        public var recConfidenceSessions: Int?
        public var recBasedOnSessions: Int?
        public var recComputedAt: Date?

        public var decisionRaw: String?
        public var decisionManualKg: Double?
        public var recommendedWeightKg: Double?
        public var usedWeightKg: Double?
        public var loadDeltaKg: Double?
        public var statusRaw: String
        public var completedAt: Date?
        public var session: WorkoutSessionEntity?
        @Relationship(deleteRule: .cascade, inverse: \SetRecordEntity.exercise)
        public var setRecords: [SetRecordEntity] = []

        public init(
            id: UUID, order: Int, exerciseID: UUID?, exerciseNameSnapshot: String,
            plannedSets: Int, repLower: Int, repUpper: Int, rirLower: Int, rirUpper: Int,
            restSeconds: Int, statusRaw: String, completedAt: Date?
        ) {
            self.id = id
            self.order = order
            self.exerciseID = exerciseID
            self.exerciseNameSnapshot = exerciseNameSnapshot
            self.plannedSets = plannedSets
            self.repLower = repLower
            self.repUpper = repUpper
            self.rirLower = rirLower
            self.rirUpper = rirUpper
            self.restSeconds = restSeconds
            self.statusRaw = statusRaw
            self.completedAt = completedAt
        }
    }

    @Model
    public final class SetRecordEntity {
        @Attribute(.unique) public var id: UUID
        public var index: Int
        public var weightKg: Double
        public var targetReps: Int
        public var actualReps: Int
        public var effortRaw: Int?
        public var discomfortRaw: Int?
        public var confirmedAt: Date
        public var exercise: ExerciseSessionEntity?

        public init(id: UUID, index: Int, weightKg: Double, targetReps: Int, actualReps: Int,
                    effortRaw: Int?, discomfortRaw: Int?, confirmedAt: Date) {
            self.id = id
            self.index = index
            self.weightKg = weightKg
            self.targetReps = targetReps
            self.actualReps = actualReps
            self.effortRaw = effortRaw
            self.discomfortRaw = discomfortRaw
            self.confirmedAt = confirmedAt
        }
    }

    @Model
    public final class PhaseStateEntity {
        @Attribute(.unique) public var id: UUID
        public var phaseKindRaw: String
        public var phaseWeek: Int?
        public var passedBlocks: Int
        public var consecutiveFailures: Int
        public var blockBaselineKg: Double?
        public var startedAt: Date

        public init(id: UUID, phaseKindRaw: String, phaseWeek: Int?, passedBlocks: Int,
                    consecutiveFailures: Int, blockBaselineKg: Double?, startedAt: Date) {
            self.id = id
            self.phaseKindRaw = phaseKindRaw
            self.phaseWeek = phaseWeek
            self.passedBlocks = passedBlocks
            self.consecutiveFailures = consecutiveFailures
            self.blockBaselineKg = blockBaselineKg
            self.startedAt = startedAt
        }
    }

    @Model
    public final class BodyMeasurementEntity {
        @Attribute(.unique) public var id: UUID
        public var date: Date
        public var weightKg: Double?
        public var waistCm: Double?
        public var chestCm: Double?
        public var armCm: Double?
        public var thighCm: Double?
        public var hipCm: Double?
        public var bodyFatPercent: Double?
        public var provenanceRaw: String

        public init(id: UUID, date: Date, weightKg: Double?, waistCm: Double?, chestCm: Double?,
                    armCm: Double?, thighCm: Double?, hipCm: Double?, bodyFatPercent: Double?,
                    provenanceRaw: String) {
            self.id = id
            self.date = date
            self.weightKg = weightKg
            self.waistCm = waistCm
            self.chestCm = chestCm
            self.armCm = armCm
            self.thighCm = thighCm
            self.hipCm = hipCm
            self.bodyFatPercent = bodyFatPercent
            self.provenanceRaw = provenanceRaw
        }
    }

    @Model
    public final class ActivityRecordEntity {
        @Attribute(.unique) public var id: UUID
        public var date: Date
        public var kindRaw: String
        public var durationSeconds: Int
        public var activeEnergyKcal: Double?
        public var provenanceRaw: String
        public var healthKitSampleID: UUID?

        public init(id: UUID, date: Date, kindRaw: String, durationSeconds: Int,
                    activeEnergyKcal: Double?, provenanceRaw: String, healthKitSampleID: UUID?) {
            self.id = id
            self.date = date
            self.kindRaw = kindRaw
            self.durationSeconds = durationSeconds
            self.activeEnergyKcal = activeEnergyKcal
            self.provenanceRaw = provenanceRaw
            self.healthKitSampleID = healthKitSampleID
        }
    }
}
