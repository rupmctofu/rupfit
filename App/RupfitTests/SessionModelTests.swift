import XCTest
import SwiftData
import RupfitCore
@testable import RupfitPersistence
@testable import Rupfit

@MainActor
final class SessionModelTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_760_000_000)
    var container: ModelContainer!
    var repository: SessionRepository!

    override func setUp() async throws {
        container = try ModelContainer(
            for: Schema(versionedSchema: SchemaV1.self),
            migrationPlan: RupfitMigrationPlan.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        repository = SessionRepository(modelContainer: container)
    }

    func makeSession(suggested: Double? = nil) -> WorkoutSession {
        let exerciseID = UUID()
        let prescription = ExercisePrescription(sets: 3, repRange: 8...12, targetRIR: 3...4, restSeconds: 180)
        let recommendation = suggested.map {
            ProgressionRecommendation(
                suggestedWeightKg: $0, suggestedSets: 3, suggestedTargetReps: 8,
                action: .increase, reason: .topOfRangeReached,
                confidence: .medium(2), basedOnSessions: 2, computedAt: now
            )
        }
        let exercise = ExerciseSession(
            order: 1, exerciseID: exerciseID, exerciseNameSnapshot: "Peso muerto",
            prescription: prescription, recommendation: recommendation
        )
        return WorkoutSession(
            planDayID: UUID(), dayNameSnapshot: "MIÉRCOLES / TRACCIÓN",
            scheduledDate: now, phase: .readaptation(week: 1),
            status: .scheduled, exercises: [exercise]
        )
    }

    func model(for session: WorkoutSession, suggested: Double? = nil) -> SessionModel {
        SessionModel(
            session: session,
            store: repository,
            exerciseMeta: [:],
            now: { [now] in now }
        )
    }

    func testAcceptRecordsTheSuggestedWeightAsTheDecision() async throws {
        let session = makeSession(suggested: 92.5)
        try await repository.createSession(session)
        let sut = model(for: session, suggested: 92.5)
        await sut.accept()
        XCTAssertEqual(sut.usedWeightKg, 92.5)
        XCTAssertEqual(sut.currentExercise.decision, .accepted)
        XCTAssertEqual(sut.currentExercise.loadDeltaKg ?? 1, 0, accuracy: 1e-6)
    }

    func testManualWeightAndTwoSetsArePersisted() async throws {
        let session = makeSession()
        try await repository.createSession(session)
        let sut = model(for: session)
        await sut.setManualWeight(60)
        XCTAssertEqual(sut.usedWeightKg, 60)

        await sut.confirmSet(reps: 8, effort: .correct, discomfort: nil)
        XCTAssertEqual(sut.currentExercise.sets.count, 1)
        let rest = sut.remainingRest(at: now)
        XCTAssertNotNil(rest)

        await sut.confirmSet(reps: 8, effort: .hard, discomfort: nil)
        XCTAssertEqual(sut.currentExercise.sets.count, 2)

        let stored = try await repository.session(id: session.id)
        XCTAssertEqual(stored?.status, .inProgress)
        XCTAssertEqual(stored?.exercises.first?.sets.count, 2)
        XCTAssertEqual(stored?.exercises.first?.usedWeightKg, 60)
    }

    func testFinishPartialClosesTheSession() async throws {
        let session = makeSession()
        try await repository.createSession(session)
        let sut = model(for: session)
        await sut.setManualWeight(60)
        await sut.confirmSet(reps: 8, effort: .correct, discomfort: nil)
        await sut.finish(partial: true)
        XCTAssertTrue(sut.finished)
        let stored = try await repository.session(id: session.id)
        XCTAssertEqual(stored?.status, .partial)
        XCTAssertEqual(stored?.exercises.first?.sets.count, 1)
    }

    func testWeightStepperMovesOneIncrement() async throws {
        let session = makeSession()
        try await repository.createSession(session)
        let sut = model(for: session)
        await sut.setManualWeight(60)
        await sut.adjustWeight(by: sut.incrementKg)
        XCTAssertEqual(sut.usedWeightKg, 62.5)
        await sut.adjustWeight(by: -sut.incrementKg)
        XCTAssertEqual(sut.usedWeightKg, 60)
    }
}
