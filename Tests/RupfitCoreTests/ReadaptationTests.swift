import XCTest
@testable import RupfitCore

/// T-26…T-29 and T-33…T-35: the readaptation gate and block prescriptions of
/// `training-science.md` §6, as corrected at G1 (a block is one week; effort is
/// compared as buckets).
final class ReadaptationTests: XCTestCase {
    let engine = ProgressionEngine()
    let now = Date(timeIntervalSince1970: 1_760_000_000)

    func input(
        passedBlocks: Int,
        week: Int,
        performed: Int,
        role: TrainingRole = .primary,
        prescription: ExercisePrescription,
        sets: [(reps: Int, effort: Effort?, discomfort: Discomfort)],
        consecutiveFailures: Int = 0,
        baseline: Double? = nil,
        weight: Double = 90
    ) -> ProgressionInput {
        let history = ExerciseOutcome(
            date: now.addingTimeInterval(-86_400),
            weightKg: weight,
            recommendedWeightKg: nil,
            sets: sets.map {
                SetOutcome(targetReps: prescription.repRange.lowerBound,
                           actualReps: $0.reps, effort: $0.effort, discomfort: $0.discomfort)
            }
        )
        return ProgressionInput(
            exercise: Exercise(
                name: "Peso muerto convencional",
                primaryMuscle: .hamstrings,
                pattern: .hinge,
                equipment: .barbell,
                loadIncrementKg: 2.5
            ),
            prescription: prescription,
            phase: .readaptation(week: week),
            phaseState: PhaseState(
                passedBlocks: passedBlocks,
                week: week,
                performedSessions: performed,
                consecutiveFailures: consecutiveFailures,
                role: role,
                blockBaselineKg: baseline
            ),
            history: [history]
        )
    }

    func primary(_ sets: Int, _ range: ClosedRange<Int> = 8...12) -> ExercisePrescription {
        ExercisePrescription(sets: sets, repRange: range, targetRIR: 3...4, restSeconds: 180)
    }

    func accessory() -> ExercisePrescription {
        ExercisePrescription(sets: 2, repRange: 10...15, targetRIR: 3...3, restSeconds: 120)
    }

    // MARK: - T-26…T-29

    func testT26BlockOnePassedShowsBlockTwoSetsAtTheSameWeight() {
        let value = input(passedBlocks: 0, week: 1, performed: 2,
                          prescription: primary(2),
                          sets: [(10, .easy, .none), (10, .easy, .none)])
        XCTAssertEqual(engine.evaluateBlock(value).kind, .pass)
        let result = engine.recommend(value, now: now)
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedWeightKg, 90)
        XCTAssertEqual(result.suggestedSets, 3)
        XCTAssertEqual(result.reason, .readaptationBlockPassed)
    }

    func testT27BlockTwoMissedSessionRepeats() {
        let value = input(passedBlocks: 1, week: 2, performed: 1, role: .accessory,
                          prescription: accessory(),
                          sets: [(12, .easy, .none), (12, .easy, .none)])
        let decision = engine.evaluateBlock(value)
        XCTAssertEqual(decision.kind, .repeatBlock)
        XCTAssertEqual(decision.unmetCriteria, [.sessionsMissed])
        let result = engine.recommend(value, now: now)
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.suggestedSets, 2)
        XCTAssertEqual(result.reason, .readaptationBlockNotPassed)
    }

    func testT28CapAtWeekEight() {
        let value = input(passedBlocks: 1, week: 8, performed: 1, role: .accessory,
                          prescription: accessory(),
                          sets: [(12, .easy, .none), (12, .easy, .none)])
        XCTAssertEqual(engine.evaluateBlock(value).kind, .capReached)
        let result = engine.recommend(value, now: now)
        XCTAssertEqual(result.action, .hold)
        XCTAssertEqual(result.reason, .readaptationCapReached)
    }

    func testT29BlockFourPassedAdvancesToNormal() {
        let value = input(passedBlocks: 3, week: 7, performed: 3,
                          prescription: primary(4),
                          sets: [(8, .easy, .none), (8, .easy, .none),
                                 (8, .easy, .none), (8, .easy, .none)])
        XCTAssertEqual(engine.evaluateBlock(value).kind, .advanceToNormal)
    }

    // MARK: - T-33…T-35

    func testT33SetHarderThanTargetFailsTheGate() {
        let value = input(passedBlocks: 1, week: 2, performed: 3,
                          prescription: primary(3),
                          sets: [(10, .easy, .none), (10, .correct, .none), (10, .easy, .none)])
        let decision = engine.evaluateBlock(value)
        XCTAssertEqual(decision.kind, .repeatBlock)
        XCTAssertEqual(decision.unmetCriteria, [.effortHarderThanTarget])
        let result = engine.recommend(value, now: now)
        XCTAssertEqual(result.reason, .readaptationBlockNotPassed)
    }

    func testT34UnansweredEffortFailsTheGate() {
        let value = input(passedBlocks: 0, week: 1, performed: 3,
                          prescription: primary(2),
                          sets: [(10, nil, .none), (10, nil, .none)])
        let decision = engine.evaluateBlock(value)
        XCTAssertEqual(decision.kind, .repeatBlock)
        XCTAssertEqual(decision.unmetCriteria, [.effortHarderThanTarget])
    }

    func testT35PassInWeekEightStillExits() {
        let value = input(passedBlocks: 3, week: 8, performed: 3,
                          prescription: primary(4),
                          sets: [(8, .easy, .none), (8, .easy, .none),
                                 (8, .easy, .none), (8, .easy, .none)])
        XCTAssertEqual(engine.evaluateBlock(value).kind, .advanceToNormal)
    }

    // MARK: - The increment between blocks

    func testAppliedGateUsesTheAdvancedBaseline() {
        let value = input(passedBlocks: 1, week: 2, performed: 3,
                          prescription: primary(3),
                          sets: [(10, .easy, .none), (10, .easy, .none), (10, .easy, .none)],
                          baseline: 92.5)
        let result = engine.recommend(value, now: now)
        XCTAssertEqual(result.action, .increase)
        XCTAssertEqual(result.suggestedWeightKg, 92.5)
    }
}
