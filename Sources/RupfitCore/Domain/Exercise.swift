import Foundation

public struct Exercise: Identifiable, Hashable, Sendable, Codable {
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

    public init(
        id: UUID = UUID(),
        name: String,
        primaryMuscle: MuscleGroup,
        pattern: MovementPattern,
        equipment: Equipment,
        loadIncrementKg: Double,
        isCustom: Bool = false,
        isArchived: Bool = false
    ) {
        self.id = id
        self.name = name
        self.primaryMuscle = primaryMuscle
        self.pattern = pattern
        self.equipment = equipment
        self.loadIncrementKg = loadIncrementKg
        self.isCustom = isCustom
        self.isArchived = isArchived
    }
}

public struct ExercisePrescription: Hashable, Sendable, Codable {
    public var sets: Int
    public var repRange: ClosedRange<Int>
    public var targetRIR: ClosedRange<Int>
    public var restSeconds: Int

    public init(sets: Int, repRange: ClosedRange<Int>, targetRIR: ClosedRange<Int>, restSeconds: Int) {
        self.sets = sets
        self.repRange = repRange
        self.targetRIR = targetRIR
        self.restSeconds = restSeconds
    }

    /// A prescription is only usable when a block could be built from it.
    public var isValid: Bool {
        sets > 0
            && repRange.lowerBound > 0
            && repRange.lowerBound <= repRange.upperBound
            && targetRIR.lowerBound >= 0
            && targetRIR.lowerBound <= targetRIR.upperBound
            && restSeconds > 0
    }
}
