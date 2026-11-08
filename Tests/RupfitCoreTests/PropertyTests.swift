import XCTest
@testable import RupfitCore

/// P-1…P-8 of `docs/progression-engine.md` §11.2. Deterministic: the seed is
/// fixed and printed in the failure message.
final class PropertyTests: XCTestCase {
    let engine = ProgressionEngine()
    let now = Date(timeIntervalSince1970: 1_760_000_000)
    let prescription = ExercisePrescription(sets: 4, repRange: 6...10, targetRIR: 1...3, restSeconds: 180)

    struct RNG {
        var state: UInt64
        mutating func next() -> UInt64 {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return state
        }
        mutating func int(_ upperBound: Int) -> Int {
            Int(next() % UInt64(upperBound))
        }
        mutating func double(_ upperBound: Double) -> Double {
            Double(next() % 1_000) / 1_000 * upperBound
        }
        mutating func pick<T>(_ values: [T]) -> T {
            values[int(values.count)]
        }
    }

    func exercise(increment: Double) -> Exercise {
        Exercise(name: "Test", primaryMuscle: .hamstrings, pattern: .hinge,
                 equipment: .barbell, loadIncrementKg: increment)
    }

    func makeInput(seed: UInt64) -> ProgressionInput {
        var rng = RNG(state: seed)
        let increment = rng.pick([2.5, 2.0, 5.0])
        let sessionCount = 1 + rng.int(3)
        let efforts: [Effort?] = [nil, .easy, .correct, .hard, .failure]
        var history: [ExerciseOutcome] = []
        for session in 0..<sessionCount {
            let setCount = 1 + rng.int(4)
            let weight = Double(rng.pick([20, 40, 60, 80, 100]))
            let recommended: Double? = rng.int(2) == 0 ? nil : weight + Double(increment)
            let sets: [SetOutcome] = (0..<setCount).map { _ in
                let discomfort: Discomfort =
                    rng.int(10) == 0 ? .pain : (rng.int(10) == 0 ? .mild : .none)
                return SetOutcome(
                    targetReps: 6,
                    actualReps: rng.int(13),          // 0...12, includes out-of-range
                    effort: rng.pick(efforts),
                    discomfort: discomfort
                )
            }
            history.append(ExerciseOutcome(
                date: now.addingTimeInterval(TimeInterval(-86_400 * (session + 1))),
                weightKg: weight,
                recommendedWeightKg: recommended,
                sets: sets
            ))
        }
        return ProgressionInput(
            exercise: exercise(increment: increment),
            prescription: prescription,
            phase: .normal,
            history: history
        )
    }

    func testP1Purity() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            let a = engine.recommend(input, now: now)
            let b = engine.recommend(input, now: now)
            XCTAssertEqual(a, b, "seed \(seed)")
        }
    }

    func testP2Granularity() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            let result = engine.recommend(input, now: now)
            guard let weight = result.suggestedWeightKg, result.action != .hold else { continue }
            let increment = input.exercise.loadIncrementKg
            guard increment > 0 else { continue }
            let steps = weight / increment
            XCTAssertEqual(steps, steps.rounded(), accuracy: 1e-6, "seed \(seed): \(weight) kg")
        }
    }

    func testP3NoInvention() {
        let input = ProgressionInput(
            exercise: exercise(increment: 2.5),
            prescription: prescription,
            phase: .normal,
            history: []
        )
        XCTAssertNil(engine.recommend(input, now: now).suggestedWeightKg)
    }

    func testP4SymptomSafety() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            let hasPain = input.history.first?.sets.contains { $0.discomfort == Discomfort.pain } ?? false
            let result = engine.recommend(input, now: now)
            if hasPain {
                XCTAssertNotEqual(result.action, .increase, "seed \(seed)")
            }
        }
    }

    func testP5BoundedStep() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            guard let last = input.history.first,
                  let weight = engine.recommend(input, now: now).suggestedWeightKg else {
                continue
            }
            let result = engine.recommend(input, now: now)
            let increment = input.exercise.loadIncrementKg
            if result.action == .increase {
                XCTAssertLessThanOrEqual(weight, last.weightKg + increment + 1e-6, "seed \(seed)")
            }
            if result.action == .decrease {
                XCTAssertGreaterThanOrEqual(weight, last.weightKg - increment - 1e-6, "seed \(seed)")
            }
        }
    }

    func testP6NoNegativeWeight() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            let result = engine.recommend(input, now: now)
            guard let weight = result.suggestedWeightKg else { continue }
            XCTAssertGreaterThanOrEqual(weight, 0, "seed \(seed)")
            if result.action == .decrease, input.exercise.loadIncrementKg > 0 {
                XCTAssertGreaterThanOrEqual(weight, input.exercise.loadIncrementKg, "seed \(seed)")
            }
        }
    }

    func testP7RepsInsideTheRange() {
        for seed in 1...200 {
            let input = makeInput(seed: UInt64(seed))
            let result = engine.recommend(input, now: now)
            XCTAssertTrue(prescription.repRange.contains(result.suggestedTargetReps), "seed \(seed)")
        }
    }

    func testP8MonotoneReason() {
        for seed in 1...100 {
            var rng = RNG(state: UInt64(seed))
            let weight = Double(rng.pick([20, 40, 60, 80, 100]))
            let top = ExerciseOutcome(
                date: now, weightKg: weight, recommendedWeightKg: nil,
                sets: [SetOutcome(targetReps: 6, actualReps: 10,
                                  effort: .hard, discomfort: Discomfort.none)])
            let bottom = ExerciseOutcome(
                date: now, weightKg: weight, recommendedWeightKg: nil,
                sets: [SetOutcome(targetReps: 6, actualReps: 4,
                                  effort: .hard, discomfort: Discomfort.none)])
            let topResult = engine.recommend(ProgressionInput(
                exercise: exercise(increment: 2.5), prescription: prescription,
                phase: .normal, history: [top]), now: now)
            let bottomResult = engine.recommend(ProgressionInput(
                exercise: exercise(increment: 2.5), prescription: prescription,
                phase: .normal, history: [bottom]), now: now)
            XCTAssertEqual(topResult.action, .increase)
            XCTAssertNotEqual(bottomResult.action, .increase)
        }
    }
}
