import XCTest
@testable import RupfitCore

/// The invariants of `data-model.md` §6 that can be enforced by the types.
final class DomainInvariantsTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_760_000_000)
    let prescription = ExercisePrescription(sets: 3, repRange: 6...10, targetRIR: 1...3, restSeconds: 180)

    func testI7UnansweredEffortAndDiscomfortStayNil() {
        let set = SetRecord(index: 1, weightKg: 100, targetReps: 6, actualReps: 6, confirmedAt: now)
        XCTAssertNil(set.effort)
        XCTAssertNil(set.discomfort)
        XCTAssertFalse(set.effort?.isHardSet ?? false)
    }

    func testI8LoadDeltaIsWrittenWithTheDecision() {
        var session = ExerciseSession(order: 1, exerciseID: UUID(), exerciseNameSnapshot: "Sentadilla",
                                     prescription: prescription, recommendation: nil)
        session.decide(.manual(kg: 100), recommendedKg: 102.5, usedKg: 100)
        XCTAssertEqual(session.loadDeltaKg ?? 0, -2.5, accuracy: 1e-6)
        XCTAssertEqual(session.usedWeightKg, 100)
        XCTAssertEqual(session.recommendedWeightKg, 102.5)
    }

    func testI8NoRecommendedWeightMeansNoDelta() {
        var session = ExerciseSession(order: 1, exerciseID: nil, exerciseNameSnapshot: "Remo",
                                     prescription: prescription, recommendation: nil)
        session.decide(.manual(kg: 40), recommendedKg: nil, usedKg: 40)
        XCTAssertNil(session.loadDeltaKg)
    }

    func testI10MeasurementNeedsAtLeastOneMeasure() {
        let empty = BodyMeasurement(date: now)
        XCTAssertFalse(empty.isValid)
        let weight = BodyMeasurement(date: now, weightKg: 78.4)
        XCTAssertTrue(weight.isValid)
    }

    func testHardSetBucketExcludesEasy() {
        XCTAssertTrue(Effort.correct.isHardSet)
        XCTAssertTrue(Effort.hard.isHardSet)
        XCTAssertTrue(Effort.failure.isHardSet)
        XCTAssertFalse(Effort.easy.isHardSet)
    }

    func testPrescriptionValidation() {
        XCTAssertTrue(prescription.isValid)
        XCTAssertFalse(ExercisePrescription(sets: 0, repRange: 6...10, targetRIR: 1...3, restSeconds: 90).isValid)
        // Inverted ranges cannot exist: `ClosedRange` traps at construction, so the
        // only invalid ranges left to validate are empty ones (lower bound 0).
        XCTAssertFalse(ExercisePrescription(sets: 3, repRange: 0...0, targetRIR: 1...3, restSeconds: 90).isValid)
    }
}
