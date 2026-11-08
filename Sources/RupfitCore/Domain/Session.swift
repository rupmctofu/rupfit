import Foundation

public enum ExerciseStatus: String, Sendable, Codable {
    case pending, active, done, skipped
}

public enum SessionStatus: String, Sendable, Codable {
    case scheduled, inProgress, completed, partial, abandoned
}

public struct SetRecord: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let index: Int              // 1-based, matches "SERIE n"
    public var weightKg: Double        // canonical kg, always (I-3)
    public var targetReps: Int
    public var actualReps: Int
    public var effort: Effort?         // nil = unanswered (I-7)
    public var discomfort: Discomfort? // nil = unanswered (I-7)
    public let confirmedAt: Date       // the confirmation instant, not "now"

    public init(
        id: UUID = UUID(),
        index: Int,
        weightKg: Double,
        targetReps: Int,
        actualReps: Int,
        effort: Effort? = nil,
        discomfort: Discomfort? = nil,
        confirmedAt: Date
    ) {
        self.id = id
        self.index = index
        self.weightKg = weightKg
        self.targetReps = targetReps
        self.actualReps = actualReps
        self.effort = effort
        self.discomfort = discomfort
        self.confirmedAt = confirmedAt
    }

    public var metTarget: Bool { actualReps >= targetReps }
}

public struct ExerciseSession: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let order: Int
    public let exerciseID: UUID?          // nil once deleted (I-4)
    public let exerciseNameSnapshot: String
    public let prescription: ExercisePrescription
    public let recommendation: ProgressionRecommendation?  // frozen (I-2)

    public private(set) var decision: LoadDecision?
    public private(set) var recommendedWeightKg: Double?
    public private(set) var usedWeightKg: Double?
    public private(set) var loadDeltaKg: Double?           // I-8
    public var sets: [SetRecord]
    public var status: ExerciseStatus
    public var completedAt: Date?

    public init(
        id: UUID = UUID(),
        order: Int,
        exerciseID: UUID?,
        exerciseNameSnapshot: String,
        prescription: ExercisePrescription,
        recommendation: ProgressionRecommendation?,
        sets: [SetRecord] = [],
        status: ExerciseStatus = .pending,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.order = order
        self.exerciseID = exerciseID
        self.exerciseNameSnapshot = exerciseNameSnapshot
        self.prescription = prescription
        self.recommendation = recommendation
        self.sets = sets
        self.status = status
        self.completedAt = completedAt
    }

    /// The only way to record a decision, so `loadDeltaKg` cannot drift (I-8).
    public mutating func decide(_ decision: LoadDecision, recommendedKg: Double?, usedKg: Double) {
        self.decision = decision
        self.recommendedWeightKg = recommendedKg
        self.usedWeightKg = usedKg
        if let recommendedKg {
            self.loadDeltaKg = usedKg - recommendedKg
        } else {
            self.loadDeltaKg = nil
        }
    }
}

public struct WorkoutSession: Identifiable, Hashable, Sendable {
    public let id: UUID
    public let planDayID: UUID
    public let dayNameSnapshot: String
    public let scheduledDate: Date
    public var startedAt: Date?
    public var endedAt: Date?
    public var phase: TrainingPhase
    public var status: SessionStatus
    public var exercises: [ExerciseSession]

    public init(
        id: UUID = UUID(),
        planDayID: UUID,
        dayNameSnapshot: String,
        scheduledDate: Date,
        startedAt: Date? = nil,
        endedAt: Date? = nil,
        phase: TrainingPhase,
        status: SessionStatus = .scheduled,
        exercises: [ExerciseSession] = []
    ) {
        self.id = id
        self.planDayID = planDayID
        self.dayNameSnapshot = dayNameSnapshot
        self.scheduledDate = scheduledDate
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.phase = phase
        self.status = status
        self.exercises = exercises
    }

    /// A session only becomes `inProgress` when a set is confirmed, never when the
    /// screen opens (data-model.md §7).
    public var hasEvidence: Bool {
        exercises.contains { !$0.sets.isEmpty }
    }
}

public struct UserProfile: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var displayName: String?
    public var massUnit: MassUnit
    public var weightGoal: WeightGoal?
    public var weeklyTrainingDays: Int
    public var availableEquipment: Set<Equipment>
    public var autoStartRestTimer: Bool

    public init(
        id: UUID = UUID(),
        displayName: String? = nil,
        massUnit: MassUnit = .kilograms,
        weightGoal: WeightGoal? = nil,
        weeklyTrainingDays: Int = 3,
        availableEquipment: Set<Equipment> = [],
        autoStartRestTimer: Bool = true
    ) {
        self.id = id
        self.displayName = displayName
        self.massUnit = massUnit
        self.weightGoal = weightGoal
        self.weeklyTrainingDays = weeklyTrainingDays
        self.availableEquipment = availableEquipment
        self.autoStartRestTimer = autoStartRestTimer
    }
}

public struct BodyMeasurement: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var date: Date
    public var weightKg: Double?
    public var waistCm: Double?
    public var chestCm: Double?
    public var armCm: Double?
    public var thighCm: Double?
    public var hipCm: Double?
    public var bodyFatPercent: Double?
    public var provenance: Provenance

    public init(
        id: UUID = UUID(),
        date: Date,
        weightKg: Double? = nil,
        waistCm: Double? = nil,
        chestCm: Double? = nil,
        armCm: Double? = nil,
        thighCm: Double? = nil,
        hipCm: Double? = nil,
        bodyFatPercent: Double? = nil,
        provenance: Provenance = .manual
    ) {
        self.id = id
        self.date = date
        self.weightKg = weightKg
        self.waistCm = waistCm
        self.chestCm = chestCm
        self.armCm = armCm
        self.thighCm = thighCm
        self.hipCm = hipCm
        self.bodyFatPercent = bodyFatPercent
        self.provenance = provenance
    }

    /// I-10: a measurement carries at least one measure.
    public var isValid: Bool {
        [weightKg, waistCm, chestCm, armCm, thighCm, hipCm, bodyFatPercent]
            .contains { $0 != nil }
    }
}

public enum ActivityKind: String, Sendable, Codable {
    case strength, cardio, other
}

public struct ActivityRecord: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var date: Date
    public var kind: ActivityKind
    public var durationSeconds: Int
    public var activeEnergyKcal: Double?
    public var provenance: Provenance
    public var healthKitSampleID: UUID?   // dedupe key for imports (I-11)

    public init(
        id: UUID = UUID(),
        date: Date,
        kind: ActivityKind,
        durationSeconds: Int,
        activeEnergyKcal: Double? = nil,
        provenance: Provenance = .manual,
        healthKitSampleID: UUID? = nil
    ) {
        self.id = id
        self.date = date
        self.kind = kind
        self.durationSeconds = durationSeconds
        self.activeEnergyKcal = activeEnergyKcal
        self.provenance = provenance
        self.healthKitSampleID = healthKitSampleID
    }
}
