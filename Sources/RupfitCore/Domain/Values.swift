import Foundation

/// The domain is plain `Sendable` values (data-model.md §1). No persistence, no UI.

public enum MuscleGroup: String, Sendable, CaseIterable, Codable {
    case quadriceps, hamstrings, glutes, calves, lowerBack
    case chest, shoulders, triceps, lats, upperBack, biceps, forearms, core
}

public enum MovementPattern: String, Sendable, CaseIterable, Codable {
    case squat, hinge, horizontalPush, verticalPush
    case horizontalPull, verticalPull, isolation, core
}

public enum Equipment: String, Sendable, CaseIterable, Codable {
    case barbell, dumbbell, machine, cable, bodyweight, band
}

/// Coarse RIR bucket: the raw value *is* the number of reps in reserve, and the
/// ordering matters. A raw RIR is never stored (data-model.md §2).
public enum Effort: Int, Sendable, CaseIterable, Codable {
    case easy = 3       // ≥3 reps in reserve → UI "fácil"
    case correct = 2    // 2 RIR              → UI "correcto"
    case hard = 1       // 1 RIR              → UI "duro"
    case failure = 0    // 0 RIR              → UI "fallo"

    /// A hard set counts toward volume when it is within 2 reps of failure.
    /// `easy` (≥3 RIR) is excluded because the bucket cannot prove ≤3
    /// (training-science.md §4, G1 correction).
    public var isHardSet: Bool { rawValue <= Effort.correct.rawValue }
}

public enum Discomfort: Int, Sendable, CaseIterable, Codable {
    case none = 0       // UI "ninguna"
    case mild = 1       // UI "molestia"
    case pain = 2       // UI "dolor"
}

public enum MassUnit: String, Sendable, Codable {
    case kilograms, pounds
}

public enum WeightGoal: String, Sendable, Codable {
    case maintain, lose, gain
}

public enum Provenance: String, Sendable, Codable {
    case healthKit, manual, estimated
}

public enum TrainingRole: String, Sendable, Codable {
    case primary, accessory
}
