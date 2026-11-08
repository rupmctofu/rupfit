import Foundation

/// Every derived value is computed, never stored (I-6). Pure functions, no clock:
/// windows and dates come from the caller.
public enum Statistics {
    public static let e1RMFormulaVersion = 1

    // MARK: - Volume

    /// `Σ weightKg × actualReps` over the given sets.
    public static func sessionVolume(_ sets: [SetRecord]) -> Double {
        sets.reduce(0) { $0 + $1.weightKg * Double($1.actualReps) }
    }

    /// Hard sets for one muscle in a window: effort ≤2 RIR, muscle resolved from the
    /// exercise, set confirmed inside the interval. `easy` and unanswered are out
    /// (training-science.md §4, G1 correction).
    public static func hardSets(
        in sessions: [ExerciseSession],
        muscle: MuscleGroup,
        exercises: [UUID: Exercise],
        within interval: DateInterval
    ) -> Int {
        sessions.reduce(0) { total, session in
            guard let exerciseID = session.exerciseID,
                  exercises[exerciseID]?.primaryMuscle == muscle else { return total }
            let count = session.sets.filter {
                interval.contains($0.confirmedAt) && ($0.effort?.isHardSet ?? false)
            }.count
            return total + count
        }
    }

    // MARK: - Estimated 1RM

    /// Epley with the RIR adjustment, display only. `nil` when the answer would be
    /// invented: unanswered effort, or reps + RIR beyond the formula's usable range.
    public static func estimatedOneRepMax(weightKg: Double, reps: Int, effort: Effort?) -> Double? {
        guard let effort, weightKg > 0, reps > 0 else { return nil }
        let total = reps + effort.rawValue
        guard total <= 12 else { return nil }
        return weightKg * (1 + Double(total) / 30)
    }

    // MARK: - Personal records

    public struct PersonalRecord: Hashable, Sendable {
        public let weightKg: Double
        public let reps: Int
        public let achievedAt: Date
    }

    /// Best weight at a given target rep count; ties are broken by the earliest
    /// confirmation, so a record's date does not move when it is merely repeated.
    public static func personalRecord(in sets: [SetRecord], targetReps: Int) -> PersonalRecord? {
        let candidates = sets.filter { $0.targetReps == targetReps && $0.actualReps >= targetReps }
        let best = candidates.max { lhs, rhs in
            if abs(lhs.weightKg - rhs.weightKg) > LoadRounding.epsilon {
                return lhs.weightKg < rhs.weightKg
            }
            return lhs.confirmedAt > rhs.confirmedAt
        }
        guard let best else { return nil }
        return PersonalRecord(weightKg: best.weightKg, reps: best.actualReps, achievedAt: best.confirmedAt)
    }

    // MARK: - Body weight

    /// Mean of daily values in the window, or `nil` with fewer than 3 samples: the
    /// chart draws gaps rather than a misleading line.
    public static func sevenDayMean(
        samples: [(date: Date, weightKg: Double)],
        within interval: DateInterval
    ) -> Double? {
        let inside = samples.filter { interval.contains($0.date) }.map(\.weightKg)
        guard inside.count >= 3 else { return nil }
        return inside.reduce(0, +) / Double(inside.count)
    }
}
