import XCTest
import SwiftData
import RupfitCore
@testable import RupfitPersistence

final class BackupTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_760_000_000)

    func makeContainer() throws -> ModelContainer {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for: Schema(versionedSchema: SchemaV1.self),
            migrationPlan: RupfitMigrationPlan.self,
            configurations: configuration
        )
    }

    func seed(_ repository: SessionRepository) async throws -> (Exercise, WorkoutSession) {
        let exercise = Exercise(
            name: "Sentadilla", primaryMuscle: .quadriceps, pattern: .squat,
            equipment: .barbell, loadIncrementKg: 2.5
        )
        let prescription = ExercisePrescription(sets: 3, repRange: 8...12, targetRIR: 3...4, restSeconds: 180)
        var exerciseSession = ExerciseSession(
            order: 1, exerciseID: exercise.id, exerciseNameSnapshot: exercise.name,
            prescription: prescription, recommendation: nil
        )
        exerciseSession.sets = [
            SetRecord(index: 1, weightKg: 60, targetReps: 8, actualReps: 8,
                      effort: .correct, discomfort: Discomfort.none, confirmedAt: now)
        ]
        exerciseSession.status = .active
        let session = WorkoutSession(
            planDayID: UUID(), dayNameSnapshot: "LUNES / PIERNA", scheduledDate: now,
            startedAt: now, phase: .readaptation(week: 1), status: .inProgress,
            exercises: [exerciseSession]
        )
        try await repository.upsertExercise(exercise)
        try await repository.createSession(session)
        return (exercise, session)
    }

    func testBackupRoundTrip() async throws {
        let source = SessionRepository(modelContainer: try makeContainer())
        let (exercise, session) = try await seed(source)
        let document = try await source.exportBackup(appVersion: "1.0.0", at: now)
        XCTAssertEqual(document.documentType, "rupfit.backup")
        XCTAssertEqual(document.schemaVersion, 1)

        let destination = SessionRepository(modelContainer: try makeContainer())
        try await destination.importBackup(document, replacementConfirmed: true)
        let restored = try await destination.session(id: session.id)
        XCTAssertEqual(restored, session)
        XCTAssertEqual(restored?.exercises.first?.sets.first?.effort, .correct)

        let exportedAgain = try await destination.exportBackup(appVersion: "1.0.0", at: now)
        XCTAssertEqual(exportedAgain.exercises.map(\.id), document.exercises.map(\.id))
        XCTAssertEqual(exportedAgain.exercises.first, exercise)
    }

    func testInvalidBackupChangesNothing() async throws {
        let repository = SessionRepository(modelContainer: try makeContainer())
        _ = try await seed(repository)
        let before = try await repository.sessionCount()

        var document = try await repository.exportBackup(appVersion: "1.0.0", at: now)
        document.exercises.append(document.exercises[0])   // duplicate identifier

        do {
            try await repository.importBackup(document, replacementConfirmed: true)
            XCTFail("an invalid document must be rejected")
        } catch {
            XCTAssertEqual(error as? BackupError, .duplicateIdentifier("exercise"))
        }
        let after = try await repository.sessionCount()
        XCTAssertEqual(after, before)
        let afterFailure = try await repository.exportBackup(appVersion: "1.0.0", at: now)
        XCTAssertEqual(afterFailure.sessions.count, 1)
    }

    func testImportRequiresExplicitReplacement() async throws {
        let repository = SessionRepository(modelContainer: try makeContainer())
        _ = try await seed(repository)
        let document = try await repository.exportBackup(appVersion: "1.0.0", at: now)
        do {
            try await repository.importBackup(document, replacementConfirmed: false)
            XCTFail("import must require confirmation")
        } catch {
            XCTAssertEqual(error as? BackupError, .replacementNotConfirmed)
        }
    }
}
