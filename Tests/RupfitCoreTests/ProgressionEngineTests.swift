import XCTest
@testable import RupfitCore

/// Scenario table T-01…T-32 of `docs/progression-engine.md` §11.1, plus the
/// readaptation rows in `ReadaptationTests`.
final class ProgressionEngineTests: XCTestCase {
    let engine = ProgressionEngine()
    let now = Date(timeIntervalSince1970: 1_760_000_000)

    // MARK: - Fixtures

    func exercise(increment: Double = 2.5, equipment: Equipment = .barbell) -> Exercise {
        Exercise(
            name: "Peso muerto convencional",
            primaryMuscle: .hamstrings,
            pattern: .hinge,
            equipment: equipment,
            loadIncrementKg: increment
        )
    }

    var prescription: ExercisePrescription {
        ExercisePrescription(sets: 4, repRange: 6...10, targetRIR: 1...3, restSeconds: 180)
    }

    func outcome(
        _ weight: Double,
        _ reps: [Int],
        effort: Effort? = .hard,
        discomfort: Discomfort = .none,
        recommended: Double? = nil,
        daysAgo: Int = 1
    ) -> ExerciseOutcome {
        ExerciseOutcome(
            date: now.addingTimeInterval(TimeInterval(-86_400 * daysAgo)),
            weightKg: weight,
            recommendedWeightKg: recommended,
            sets: reps.map {
                SetOutcome(targetReps: 6, actualReps: $0, effort: effort, discomfort: discomfort)
            }
        )
    }

    func run(
        history: [ExerciseOutcome],
        coldStart: ColdStartInput? = nil,
        increment: Double = 2.5,
        equipment: Equipment = .barbell,
        prescription: ExercisePrescription? = nil
    ) -> ProgressionRecommendation {
        engine.recommend(
            ProgressionInput(
                exercise: exercise(increment: increment, equipment: equipment),
                prescription: prescription ?? self.prescription,
                phase: .normal,
                history: history,
                coldStart: coldStart
            ),
            now: now
        )
    }

    // MARK: - T-01…T-07 cold start and top of range

    func testT01NoHistoryNoCalibration() {
        let result = run(history: [])
        XCTAssertEqual(result.action, .insufficientData)
        XCTAssertNil(result.suggestedWeightKg)
        XCTAssertEqual(result.suggestedTargetReps, 6)
        XCTAssertEqual(result.confidence.level, .low)
        XCTAssertEqual(result.reason, .insufficientData)
    }

    func testT02CalibrationDiscountsThirtyPercent() {
        let result = run(history: [], coldStart: ColdStartInput(knownWorkingWeightKg: 100, knownReps: 5))
        XCTAssertEqual(result.suggestedWeightKg, 70.0)
        XCTAssertEqual(result.action, .startFirstTime)
        XCTAssertEqual(result.reason, .coldStartFromCalibration)
    }

    func testT03CalibrationRoundsDownToIncrement() {
        let result = run(history: [], coldStart: ColdStartInput(knownWorkingWeightKg: 101, knownReps: 5))
        XCTAssertEqual(result.suggestedWeightKg, 70.0)
    }

    func testT04TopOfRangeAtOneRIR() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], effort: .hard)])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
        XCTAssertEqual(result.suggestedTargetReps, 6)
        XCTAssertEqual(result.reason, .topOfRangeReached)
    }

    func testT05TopOfRangeAtTwoRIR() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], effort: .correct)])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
        XCTAssertEqual(result.suggestedTargetReps, 6)
    }

    func testT06TopOfRangeEasy() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], effort: .easy)])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
        XCTAssertEqual(result.reason, .topOfRangeReachedEffortUnknown)
    }

    func testT07TopOfRangeEffortUnanswered() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], effort: nil)])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
        XCTAssertEqual(result.reason, .topOfRangeReachedEffortUnknown)
        XCTAssertEqual(result.confidence.level, .low)
    }

    // MARK: - T-08…T-14 double progression

    func testT08InRangeNotAtTopAddsRep() {
        let result = run(history: [outcome(100, [6, 6, 6, 6])])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 100)
        XCTAssertEqual(result.suggestedTargetReps, 7)
        XCTAssertEqual(result.reason, .addRepetition)
    }

    func testT09MixedRepsUsesHighest() {
        let result = run(history: [outcome(100, [8, 8, 7, 6])])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedTargetReps, 9)
    }

    func testT10FirstMissHolds() {
        let result = run(history: [outcome(100, [6, 6, 6, 4])])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 100)
        XCTAssertEqual(result.suggestedTargetReps, 6)
        XCTAssertEqual(result.reason, .belowRangeFirstTime)
    }

    func testT11TwoMissesAtSameWeightDecrease() {
        let result = run(history: [
            outcome(100, [5, 5, 5, 5], daysAgo: 1),
            outcome(100, [6, 6, 6, 4], daysAgo: 3)
        ])
        XCTAssertEqual(result.action, .decrease)
        XCTAssertEqual(result.suggestedWeightKg, 97.5)
        XCTAssertEqual(result.reason, .belowRangeRepeated)
    }

    func testT12CounterResetsOnWeightChange() {
        let result = run(history: [
            outcome(97.5, [5, 5, 5, 5], daysAgo: 1),
            outcome(100, [5, 5, 5, 5], daysAgo: 3)
        ])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 97.5)
    }

    func testT13ThirdMissDecreasesOneMoreIncrement() {
        let result = run(history: [
            outcome(97.5, [5, 5, 5, 5], daysAgo: 1),
            outcome(97.5, [5, 5, 5, 5], daysAgo: 3),
            outcome(100, [5, 5, 5, 5], daysAgo: 5)
        ])
        XCTAssertEqual(result.action, .decrease)
        XCTAssertEqual(result.suggestedWeightKg, 95.0)
    }

    func testT14DecreaseFloor() {
        let result = run(history: [
            outcome(2.5, [5, 5, 5, 5], daysAgo: 1),
            outcome(2.5, [5, 5, 5, 5], daysAgo: 3)
        ])
        XCTAssertEqual(result.action, .decrease)
        XCTAssertEqual(result.suggestedWeightKg, 2.5)
    }

    // MARK: - T-15…T-20 decisions and user overrides

    func testT15MildDiscomfortHolds() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], discomfort: .mild)])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 100)
        XCTAssertEqual(result.reason, .discomfortHold)
    }

    func testT16PainDecreases() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], discomfort: .pain)])
        XCTAssertEqual(result.action, .decrease)
        XCTAssertEqual(result.suggestedWeightKg, 97.5)
        XCTAssertEqual(result.reason, .discomfortReduce)
    }

    func testT17PainAtFloorWeight() {
        let result = run(history: [outcome(2.5, [10, 10, 10, 10], discomfort: .pain)])
        XCTAssertEqual(result.action, .decrease)
        XCTAssertEqual(result.suggestedWeightKg, 2.5)
    }

    func testT18UserLoweredThenTop() {
        let result = run(history: [outcome(100, [10, 10, 10, 10], recommended: 102.5)])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 100)
        XCTAssertEqual(result.reason, .userLoweredLastTime)
    }

    func testT19NextSessionAfterOverrideProgresses() {
        let result = run(history: [
            outcome(100, [10, 10, 10, 10], daysAgo: 1),
            outcome(100, [10, 10, 10, 10], recommended: 102.5, daysAgo: 3)
        ])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
    }

    func testT20UserRaisedAboveSuggestion() {
        let result = run(history: [outcome(105, [6, 6, 6, 6], recommended: 100)])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 105)
        XCTAssertEqual(result.suggestedTargetReps, 7)
    }

    // MARK: - T-21…T-25 bodyweight, abandoned and partial

    func testT21BodyweightTopOfRange() {
        let result = run(
            history: [outcome(0, [15, 15, 15])],
            increment: 0,
            equipment: .bodyweight,
            prescription: ExercisePrescription(sets: 3, repRange: 6...15, targetRIR: 1...3, restSeconds: 90)
        )
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 0)
        XCTAssertEqual(result.reason, .bodyweightTopOfRange)
    }

    func testT22BodyweightInRangeAddsRep() {
        let result = run(
            history: [outcome(0, [10, 10, 10])],
            increment: 0,
            equipment: .bodyweight,
            prescription: ExercisePrescription(sets: 3, repRange: 6...15, targetRIR: 1...3, restSeconds: 90)
        )
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedTargetReps, 11)
    }

    func testT23BodyweightBelowRange() {
        let result = run(
            history: [outcome(0, [5, 5, 5])],
            increment: 0,
            equipment: .bodyweight,
            prescription: ExercisePrescription(sets: 3, repRange: 6...15, targetRIR: 1...3, restSeconds: 90)
        )
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedTargetReps, 6)
    }

    func testT24AbandonedSessionIsIgnored() {
        let abandoned = ExerciseOutcome(date: now, weightKg: 100, recommendedWeightKg: nil, sets: [])
        let result = run(history: [abandoned, outcome(100, [10, 10, 10, 10], daysAgo: 3)])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
    }

    func testT25PartialSessionDrivesTheResult() {
        let result = run(history: [outcome(100, [10])])
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 102.5)
    }

    // MARK: - T-30…T-32

    func testT30UnknownEffortBelowRange() {
        let result = run(history: [outcome(100, [5, 5, 5, 5], effort: nil)])
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 100)
        XCTAssertEqual(result.suggestedTargetReps, 6)
    }

    func testT31DumbbellIncrement() {
        let result = run(history: [outcome(20, [10, 10, 10, 10])], increment: 2, equipment: .dumbbell)
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 22.0)
    }

    func testT32MachineIncrement() {
        let result = run(history: [outcome(60, [10, 10, 10, 10])], increment: 5, equipment: .machine)
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 65.0)
    }
}
