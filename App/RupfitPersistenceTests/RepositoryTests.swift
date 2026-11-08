import XCTest
import SwiftData
import RupfitCore
@testable import RupfitPersistence

final class RepositoryTests: XCTestCase {
    var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("rupfit-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    func makeContainer(url: URL? = nil) throws -> ModelContainer {
        let configuration: ModelConfiguration
        if let url {
            configuration = ModelConfiguration(url: url)
        } else {
            configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        }
        return try ModelContainer(
            for: Schema(versionedSchema: SchemaV1.self),
            migrationPlan: RupfitMigrationPlan.self,
            configurations: configuration
        )
    }

    func makeSession(startingAt date: Date, restSeconds: Int = 180) -> WorkoutSession {
        let exerciseID = UUID()
        let prescription = ExercisePrescription(
            sets: 4, repRange: 8...12, targetRIR: 3...4, restSeconds: restSeconds
        )
        let exercise = ExerciseSession(
            order: 1, exerciseID: exerciseID, exerciseNameSnapshot: "Peso muerto",
            prescription: prescription, recommendation: nil
        )
        return WorkoutSession(
            planDayID: UUID(), dayNameSnapshot: "MIÉRCOLES / TRACCIÓN",
            scheduledDate: date, phase: .readaptation(week: 2),
            status: .scheduled, exercises: [exercise]
        )
    }

    // MARK: - One in-progress session (I-9)

    func testAtMostOneSessionInProgress() async throws {
        let container = try makeContainer()
        let repository = SessionRepository(modelContainer: container)
        let base = Date(timeIntervalSince1970: 1_760_000_000)
        let first = makeSession(startingAt: base)
        let second = makeSession(startingAt: base.addingTimeInterval(60))
        try await repository.createSession(first)
        try await repository.createSession(second)

        try await repository.confirmSet(
            sessionID: first.id, exerciseID: first.exercises[0].id,
            set: SetRecord(index: 1, weightKg: 90, targetReps: 8, actualReps: 8, confirmedAt: base)
        )
        do {
            try await repository.confirmSet(
                sessionID: second.id, exerciseID: second.exercises[0].id,
                set: SetRecord(index: 1, weightKg: 60, targetReps: 8, actualReps: 8,
                               confirmedAt: base.addingTimeInterval(60))
            )
            XCTFail("a second in-progress session must be rejected")
        } catch {
            XCTAssertEqual(error as? SessionRepository.RepositoryError, .sessionAlreadyInProgress)
        }
    }

    // MARK: - Kill and restore (the F4 gate)

    func testKillAndRestoreKeepsTwoOfFourSetsAndTheRest() async throws {
        let url = directory.appendingPathComponent("store.sqlite")
        let base = Date(timeIntervalSince1970: 1_760_000_000)
        var container: ModelContainer? = try makeContainer(url: url)
        var repository: SessionRepository? = SessionRepository(modelContainer: container!)
        let session = makeSession(startingAt: base, restSeconds: 180)

        try await repository!.createSession(session)
        let exerciseID = session.exercises[0].id
        try await repository!.confirmSet(
            sessionID: session.id, exerciseID: exerciseID,
            set: SetRecord(index: 1, weightKg: 90, targetReps: 8, actualReps: 8,
                           effort: .correct, confirmedAt: base)
        )
        try await repository!.confirmSet(
            sessionID: session.id, exerciseID: exerciseID,
            set: SetRecord(index: 2, weightKg: 90, targetReps: 8, actualReps: 8,
                           effort: .hard, confirmedAt: base.addingTimeInterval(60))
        )

        // Tear everything down, as a crash would.
        repository = nil
        container = nil

        container = try makeContainer(url: url)
        repository = SessionRepository(modelContainer: container!)
        let resumed = try await repository!.inProgressSession()
        XCTAssertNotNil(resumed)
        XCTAssertEqual(resumed?.status, .inProgress)
        XCTAssertEqual(resumed?.exercises.first?.sets.count, 2)
        XCTAssertEqual(resumed?.exercises.first?.sets.map(\.index), [1, 2])
        XCTAssertEqual(resumed?.exercises.first?.sets.map(\.actualReps), [8, 8])

        let rest = await repository!.remainingRest(
            sessionID: session.id, now: base.addingTimeInterval(60 + 30)
        )
        XCTAssertEqual(rest ?? -1, 150, accuracy: 0.5, "180 s rest minus 30 s elapsed")
    }

    // MARK: - Transitions

    func testFinishPartialStopsCountingAsInProgress() async throws {
        let container = try makeContainer()
        let repository = SessionRepository(modelContainer: container)
        let base = Date(timeIntervalSince1970: 1_760_000_000)
        let session = makeSession(startingAt: base)
        try await repository.createSession(session)
        try await repository.confirmSet(
            sessionID: session.id, exerciseID: session.exercises[0].id,
            set: SetRecord(index: 1, weightKg: 90, targetReps: 8, actualReps: 8, confirmedAt: base)
        )
        try await repository.finish(sessionID: session.id, partial: true, at: base.addingTimeInterval(600))
        let stillInProgress = try await repository.inProgressSession()
        XCTAssertNil(stillInProgress)
        let stored = try await repository.session(id: session.id)
        XCTAssertEqual(stored?.status, .partial)
        XCTAssertEqual(stored?.endedAt, base.addingTimeInterval(600))
    }

    // MARK: - Migration plan opens and reopens

    func testEmptyMigrationPlanOpensAndReopensTheStore() async throws {
        let url = directory.appendingPathComponent("migration.sqlite")
        var container: ModelContainer? = try makeContainer(url: url)
        var context: ModelContext? = ModelContext(container!)
        let exercise = Exercise(
            name: "Sentadilla", primaryMuscle: .quadriceps, pattern: .squat,
            equipment: .barbell, loadIncrementKg: 2.5
        )
        context!.insert(SchemaV1.ExerciseEntity(domain: exercise))
        try context!.save()
        context = nil
        container = nil

        container = try makeContainer(url: url)
        let reloaded = try ModelContext(container!).fetch(FetchDescriptor<SchemaV1.ExerciseEntity>())
        XCTAssertEqual(reloaded.count, 1)
        XCTAssertEqual(try reloaded.first?.toDomain(), exercise)
    }
}
