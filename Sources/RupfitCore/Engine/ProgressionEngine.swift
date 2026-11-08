import Foundation

/// The deterministic load engine (`docs/progression-engine.md`).
///
/// It sees only the exercise, its prescription, the phase and the history. No
/// clock, no HealthKit, no UI, no randomness: `now` is injected so the output's
/// `computedAt` is testable, and nothing else reads the time.
public struct ProgressionEngine: Sendable {
    public init() {}

    public func recommend(_ input: ProgressionInput, now: Date) -> ProgressionRecommendation {
        let usable = input.history.filter { !$0.sets.isEmpty }
        guard let last = usable.first else {
            return coldStart(input, now: now)
        }

        let prescription = input.prescription
        let bottom = prescription.repRange.lowerBound
        let top = prescription.repRange.upperBound
        let sets = last.sets
        let increment = input.exercise.loadIncrementKg

        let allInRange = sets.allSatisfy { $0.actualReps >= bottom }
        let allAtTop = sets.allSatisfy { $0.actualReps >= top }
        let anyPain = sets.contains { $0.discomfort == Discomfort.pain }
        let anyMild = sets.contains { $0.discomfort == Discomfort.mild }
        let efforts = sets.compactMap { $0.effort?.rawValue }
        let hardestEffort = efforts.min()
        let lastWasLowered = last.recommendedWeightKg.map { last.weightKg < $0 - LoadRounding.epsilon } ?? false
        let confidence = confidence(for: usable, lastSets: sets)

        // Rule 2: pain outranks everything but missing data.
        if anyPain {
            return make(
                weight: decrease(from: last.weightKg, by: increment),
                sets: prescription.sets,
                reps: bottom,
                action: .decrease,
                reason: .discomfortReduce,
                confidence: confidence,
                sessions: usable.count,
                now: now
            )
        }
        // Rule 3: mild discomfort holds the load and the reps.
        if anyMild {
            return make(weight: last.weightKg, sets: prescription.sets, reps: bottom,
                        action: .hold, reason: .discomfortHold,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 4: the same weight missed twice in a row.
        if belowRangeCount(usable, bottom: bottom, weight: last.weightKg) >= 2 {
            return make(weight: decrease(from: last.weightKg, by: increment),
                        sets: prescription.sets, reps: bottom,
                        action: .decrease, reason: .belowRangeRepeated,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 5: first miss at this weight.
        if !allInRange {
            return make(weight: last.weightKg, sets: prescription.sets, reps: bottom,
                        action: .hold, reason: .belowRangeFirstTime,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 6: readaptation is gated by the block, not by the normal rules.
        if case .readaptation = input.phase {
            return readaptation(input, last: last, confidence: confidence, now: now)
        }
        // Rule 7: a voluntary lower weight becomes the baseline, never a failure.
        if lastWasLowered {
            return make(weight: last.weightKg, sets: prescription.sets, reps: bottom,
                        action: .hold, reason: .userLoweredLastTime,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 8/9: top of the range.
        if allAtTop {
            if increment <= 0 {
                return make(weight: 0, sets: prescription.sets, reps: top,
                            action: .hold, reason: .bodyweightTopOfRange,
                            confidence: confidence, sessions: usable.count, now: now)
            }
            let reason: ReasonCode = (hardestEffort.map { $0 <= Effort.hard.rawValue } ?? false)
                ? .topOfRangeReached
                : .topOfRangeReachedEffortUnknown
            return make(weight: increase(from: last.weightKg, by: increment),
                        sets: prescription.sets, reps: bottom,
                        action: .increase, reason: reason,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 10: inside the range, add one target rep.
        if allInRange {
            let maxActual = sets.map(\.actualReps).max() ?? bottom
            return make(weight: last.weightKg, sets: prescription.sets,
                        reps: min(maxActual + 1, top),
                        action: .hold, reason: .addRepetition,
                        confidence: confidence, sessions: usable.count, now: now)
        }
        // Rule 11: defensive, unreachable.
        return make(weight: last.weightKg, sets: prescription.sets, reps: bottom,
                    action: .hold, reason: .addRepetition,
                    confidence: confidence, sessions: usable.count, now: now)
    }

    // MARK: - Cold start (§5)

    private func coldStart(_ input: ProgressionInput, now: Date) -> ProgressionRecommendation {
        let prescription = input.prescription
        let bottom = prescription.repRange.lowerBound
        let increment = input.exercise.loadIncrementKg

        if let cold = input.coldStart, let known = cold.knownWorkingWeightKg, known > 0 {
            let estimate = known * 0.70
            let weight = increment > 0 ? LoadRounding.roundDown(estimate, increment: increment) : 0
            return make(weight: weight, sets: prescription.sets, reps: bottom,
                        action: .startFirstTime, reason: .coldStartFromCalibration,
                        confidence: .low(0), sessions: 0, now: now)
        }
        return ProgressionRecommendation(
            suggestedWeightKg: nil,
            suggestedSets: prescription.sets,
            suggestedTargetReps: bottom,
            action: .insufficientData,
            reason: .insufficientData,
            confidence: .low(0),
            basedOnSessions: 0,
            computedAt: now
        )
    }

    // MARK: - Helpers

    private func make(
        weight: Double,
        sets: Int,
        reps: Int,
        action: ProgressionAction,
        reason: ReasonCode,
        confidence: Confidence,
        sessions: Int,
        now: Date
    ) -> ProgressionRecommendation {
        ProgressionRecommendation(
            suggestedWeightKg: weight,
            suggestedSets: sets,
            suggestedTargetReps: reps,
            action: action,
            reason: reason,
            confidence: confidence,
            basedOnSessions: sessions,
            computedAt: now
        )
    }

    private func increase(from weight: Double, by increment: Double) -> Double {
        guard increment > 0 else { return weight }
        return LoadRounding.roundDown(weight + increment, increment: increment)
    }

    /// Never below one increment, so a decrease can always be performed.
    private func decrease(from weight: Double, by increment: Double) -> Double {
        guard increment > 0 else { return 0 }
        return max(increment, LoadRounding.roundUp(weight - increment, increment: increment))
    }

    private func belowRangeCount(_ history: [ExerciseOutcome], bottom: Int, weight: Double) -> Int {
        var count = 0
        for outcome in history {
            guard abs(outcome.weightKg - weight) <= LoadRounding.epsilon else { break }
            guard outcome.sets.contains(where: { $0.actualReps < bottom }) else { break }
            count += 1
        }
        return count
    }

    private func confidence(for history: [ExerciseOutcome], lastSets: [SetOutcome]) -> Confidence {
        let sessions = history.count
        let anyDiscomfort = lastSets.contains { ($0.discomfort ?? Discomfort.none) != Discomfort.none }
        let everyEffortUnknown = lastSets.allSatisfy { $0.effort == nil }
        if sessions <= 1 || anyDiscomfort || everyEffortUnknown {
            return .low(sessions)
        }
        if sessions == 2 {
            return .medium(sessions)
        }
        let recent = history.prefix(2)
        let recentAnswered = recent.allSatisfy { outcome in outcome.sets.contains { $0.effort != nil } }
        let recentClean = recent.allSatisfy { outcome in
            outcome.sets.allSatisfy { ($0.discomfort ?? Discomfort.none) == Discomfort.none }
        }
        return (recentAnswered && recentClean) ? .high(sessions) : .medium(sessions)
    }
}
