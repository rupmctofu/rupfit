import Foundation

// MARK: - Phase

public enum TrainingPhase: Hashable, Sendable, Codable {
    case readaptation(week: Int)   // 1...8
    case normal

    private enum CodingKeys: String, CodingKey { case kind, week }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "readaptation":
            self = .readaptation(week: try container.decode(Int.self, forKey: .week))
        default:
            self = .normal
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .readaptation(let week):
            try container.encode("readaptation", forKey: .kind)
            try container.encode(week, forKey: .week)
        case .normal:
            try container.encode("normal", forKey: .kind)
        }
    }
}

/// Everything the engine may know about the readaptation block, without a clock.
/// The caller advances `passedBlocks` and `blockBaselineKg` only on `.pass`.
public struct PhaseState: Hashable, Sendable {
    public var passedBlocks: Int        // 0...4
    public var week: Int                // 1...8
    public var performedSessions: Int   // this block's week
    public var scheduledSessions: Int   // 3 in the template
    public var consecutiveFailures: Int // blocks failed in a row
    public var role: TrainingRole
    /// The load the current block is being performed at. It only changes when the
    /// caller applies a passed gate, which is what "one increment between blocks"
    /// means without letting the engine assume a calendar.
    public var blockBaselineKg: Double?

    public init(
        passedBlocks: Int = 0,
        week: Int = 1,
        performedSessions: Int = 0,
        scheduledSessions: Int = 3,
        consecutiveFailures: Int = 0,
        role: TrainingRole = .primary,
        blockBaselineKg: Double? = nil
    ) {
        self.passedBlocks = passedBlocks
        self.week = week
        self.performedSessions = performedSessions
        self.scheduledSessions = scheduledSessions
        self.consecutiveFailures = consecutiveFailures
        self.role = role
        self.blockBaselineKg = blockBaselineKg
    }
}

// MARK: - Engine input

public struct ProgressionInput: Sendable {
    public let exercise: Exercise
    public let prescription: ExercisePrescription
    public let phase: TrainingPhase
    public let phaseState: PhaseState
    public let history: [ExerciseOutcome]   // newest first, same exercise
    public let coldStart: ColdStartInput?   // only when history is empty

    public init(
        exercise: Exercise,
        prescription: ExercisePrescription,
        phase: TrainingPhase,
        phaseState: PhaseState = PhaseState(),
        history: [ExerciseOutcome],
        coldStart: ColdStartInput? = nil
    ) {
        self.exercise = exercise
        self.prescription = prescription
        self.phase = phase
        self.phaseState = phaseState
        self.history = history
        self.coldStart = coldStart
    }
}

public struct ExerciseOutcome: Hashable, Sendable {
    public let date: Date
    public let weightKg: Double
    public let recommendedWeightKg: Double?
    public let sets: [SetOutcome]           // confirmed sets only

    public init(date: Date, weightKg: Double, recommendedWeightKg: Double?, sets: [SetOutcome]) {
        self.date = date
        self.weightKg = weightKg
        self.recommendedWeightKg = recommendedWeightKg
        self.sets = sets
    }
}

public struct SetOutcome: Hashable, Sendable {
    public let targetReps: Int
    public let actualReps: Int
    public let effort: Effort?
    public let discomfort: Discomfort?

    public init(targetReps: Int, actualReps: Int, effort: Effort?, discomfort: Discomfort? = Discomfort.none) {
        self.targetReps = targetReps
        self.actualReps = actualReps
        self.effort = effort
        self.discomfort = discomfort
    }
}

public struct ColdStartInput: Hashable, Sendable {
    public let knownWorkingWeightKg: Double?
    public let knownReps: Int?

    public init(knownWorkingWeightKg: Double?, knownReps: Int?) {
        self.knownWorkingWeightKg = knownWorkingWeightKg
        self.knownReps = knownReps
    }
}

// MARK: - Engine output

public enum ProgressionAction: String, Sendable, Codable {
    case increase, hold, decrease, startFirstTime, insufficientData
}

/// Typed reason, rendered from a Spanish template (`progression-engine.md` §4).
public enum ReasonCode: String, Sendable, Codable {
    case insufficientData
    case coldStartFromCalibration
    case topOfRangeReached
    case topOfRangeReachedEffortUnknown
    case addRepetition
    case belowRangeFirstTime
    case belowRangeRepeated
    case discomfortHold
    case discomfortReduce
    case userLoweredLastTime
    case readaptationBlockPassed
    case readaptationBlockNotPassed
    case readaptationCapReached
    case bodyweightTopOfRange
}

public struct Confidence: Hashable, Sendable, Codable {
    public enum Level: String, Sendable, Codable { case low, medium, high }
    public let level: Level
    public let sessionsConsidered: Int

    public init(level: Level, sessionsConsidered: Int) {
        self.level = level
        self.sessionsConsidered = sessionsConsidered
    }

    public static func low(_ sessions: Int = 0) -> Confidence { .init(level: .low, sessionsConsidered: sessions) }
    public static func medium(_ sessions: Int) -> Confidence { .init(level: .medium, sessionsConsidered: sessions) }
    public static func high(_ sessions: Int) -> Confidence { .init(level: .high, sessionsConsidered: sessions) }
}

public struct ProgressionRecommendation: Hashable, Sendable, Codable {
    public let suggestedWeightKg: Double?   // nil = "you choose, we have nothing"
    public let suggestedSets: Int
    public let suggestedTargetReps: Int
    public let action: ProgressionAction
    public let reason: ReasonCode
    public let confidence: Confidence
    public let basedOnSessions: Int
    public let computedAt: Date

    public init(
        suggestedWeightKg: Double?,
        suggestedSets: Int,
        suggestedTargetReps: Int,
        action: ProgressionAction,
        reason: ReasonCode,
        confidence: Confidence,
        basedOnSessions: Int,
        computedAt: Date
    ) {
        self.suggestedWeightKg = suggestedWeightKg
        self.suggestedSets = suggestedSets
        self.suggestedTargetReps = suggestedTargetReps
        self.action = action
        self.reason = reason
        self.confidence = confidence
        self.basedOnSessions = basedOnSessions
        self.computedAt = computedAt
    }
}

public enum LoadDecision: Hashable, Sendable, Codable {
    case accepted
    case repeated
    case manual(kg: Double)
}

// MARK: - Readaptation

public enum BlockCriterion: String, Sendable, CaseIterable, Codable {
    case setsNotCompleted
    case effortHarderThanTarget   // includes an unanswered effort: nothing is guessed
    case discomfortReported
    case sessionsMissed
}

public struct BlockDecision: Hashable, Sendable {
    public enum Kind: String, Sendable, Codable {
        case pass, repeatBlock, advanceToNormal, capReached
    }

    public let kind: Kind
    public let block: Int                       // 1...4
    public let unmetCriteria: Set<BlockCriterion>
    public let shouldDropIncrement: Bool        // after a second consecutive failure

    public init(kind: Kind, block: Int, unmetCriteria: Set<BlockCriterion>, shouldDropIncrement: Bool) {
        self.kind = kind
        self.block = block
        self.unmetCriteria = unmetCriteria
        self.shouldDropIncrement = shouldDropIncrement
    }
}

public struct ReadaptationBlock: Hashable, Sendable {
    public let index: Int
    public let sets: Int
    public let repRange: ClosedRange<Int>
    public let targetRIR: ClosedRange<Int>
    public let allowedEffort: Set<Effort>

    public init(
        index: Int,
        sets: Int,
        repRange: ClosedRange<Int>,
        targetRIR: ClosedRange<Int>,
        allowedEffort: Set<Effort>
    ) {
        self.index = index
        self.sets = sets
        self.repRange = repRange
        self.targetRIR = targetRIR
        self.allowedEffort = allowedEffort
    }

    /// `training-science.md` §6, as corrected at G1 (bucket comparison).
    public static func at(_ index: Int, role: TrainingRole) -> ReadaptationBlock {
        let clamped = min(max(index, 1), 4)
        switch (clamped, role) {
        case (1, .primary):
            return .init(index: 1, sets: 2, repRange: 8...12, targetRIR: 4...5, allowedEffort: [.easy])
        case (2, .primary):
            return .init(index: 2, sets: 3, repRange: 8...12, targetRIR: 3...4, allowedEffort: [.easy])
        case (3, .primary):
            return .init(index: 3, sets: 3, repRange: 8...12, targetRIR: 2...3, allowedEffort: [.easy, .correct])
        case (4, .primary):
            return .init(index: 4, sets: 4, repRange: 8...12, targetRIR: 2...2, allowedEffort: [.easy, .correct])
        case (1, .accessory):
            return .init(index: 1, sets: 2, repRange: 10...15, targetRIR: 4...4, allowedEffort: [.easy])
        case (2, .accessory):
            return .init(index: 2, sets: 2, repRange: 10...15, targetRIR: 3...3, allowedEffort: [.easy])
        case (3, .accessory):
            return .init(index: 3, sets: 3, repRange: 10...15, targetRIR: 2...3, allowedEffort: [.easy, .correct])
        default:
            return .init(index: 4, sets: 3, repRange: 10...15, targetRIR: 2...2, allowedEffort: [.easy, .correct])
        }
    }
}
