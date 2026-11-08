import Foundation
@preconcurrency import SwiftData
import RupfitCore

/// The only writer for sessions. Per-set transactions, one in-progress session,
/// and no clock of its own: every date is passed in, so the tests can pin it.
@ModelActor
public actor SessionRepository {
    public enum RepositoryError: Error, Equatable {
        case sessionAlreadyInProgress
        case sessionNotFound
        case exerciseNotFound
        case invalidTransition
    }

    // MARK: - Sessions

    @discardableResult
    public func createSession(_ session: WorkoutSession) throws -> UUID {
        SchemaV1.WorkoutSessionEntity.insert(session, into: modelContext)
        try modelContext.save()
        return session.id
    }

    /// Appends a set and commits it before returning: a crash costs at most the set
    /// in progress (NFR-3, data-model.md §7).
    public func confirmSet(sessionID: UUID, exerciseID: UUID, set: SetRecord) throws {
        guard let session = try fetchSession(id: sessionID) else {
            throw RepositoryError.sessionNotFound
        }
        guard let exercise = session.exercises.first(where: { $0.id == exerciseID }) else {
            throw RepositoryError.exerciseNotFound
        }
        // I-9: the transition to `inProgress` is the moment to enforce one at a time,
        // not the creation of a scheduled session (data-model.md §7).
        if session.statusRaw != SessionStatus.inProgress.rawValue {
            let active = FetchDescriptor<SchemaV1.WorkoutSessionEntity>(
                predicate: #Predicate { $0.statusRaw == "inProgress" }
            )
            guard try modelContext.fetchCount(active) == 0 else {
                throw RepositoryError.sessionAlreadyInProgress
            }
        }
        let entity = SchemaV1.SetRecordEntity(domain: set)
        entity.exercise = exercise
        modelContext.insert(entity)
        if session.startedAt == nil {
            session.startedAt = set.confirmedAt
        }
        session.statusRaw = SessionStatus.inProgress.rawValue
        exercise.statusRaw = ExerciseStatus.active.rawValue
        try modelContext.save()
    }

    public func inProgressSession() throws -> WorkoutSession? {
        let descriptor = FetchDescriptor<SchemaV1.WorkoutSessionEntity>(
            predicate: #Predicate { $0.statusRaw == "inProgress" }
        )
        return try modelContext.fetch(descriptor).first?.toDomain()
    }

    public func session(id: UUID) throws -> WorkoutSession? {
        try fetchSession(id: id)?.toDomain()
    }

    public func sessionCount() throws -> Int {
        try modelContext.fetchCount(FetchDescriptor<SchemaV1.WorkoutSessionEntity>())
    }

    // MARK: - Exercises

    public func upsertExercise(_ exercise: Exercise) throws {
        let descriptor = FetchDescriptor<SchemaV1.ExerciseEntity>(
            predicate: #Predicate { $0.id == exercise.id }
        )
        if let existing = try modelContext.fetch(descriptor).first {
            existing.name = exercise.name
            existing.primaryMuscleRaw = exercise.primaryMuscle.rawValue
            existing.patternRaw = exercise.pattern.rawValue
            existing.equipmentRaw = exercise.equipment.rawValue
            existing.loadIncrementKg = exercise.loadIncrementKg
            existing.isCustom = exercise.isCustom
            existing.isArchived = exercise.isArchived
        } else {
            modelContext.insert(SchemaV1.ExerciseEntity(domain: exercise))
        }
        try modelContext.save()
    }

    // MARK: - Rest (derived, never stored as a countdown)

    /// Remaining rest for the exercise of the last confirmed set, derived from
    /// `confirmedAt` + its `restSeconds` (FR-8.4, data-model.md §7).
    public func remainingRest(sessionID: UUID, now: Date) -> TimeInterval? {
        guard let session = try? fetchSession(id: sessionID) else { return nil }
        var latest: (confirmedAt: Date, restSeconds: Int)?
        for exercise in session.exercises {
            guard let last = exercise.setRecords.map(\.confirmedAt).max() else { continue }
            if latest == nil || last > latest!.confirmedAt {
                latest = (last, exercise.restSeconds)
            }
        }
        guard let latest else { return nil }
        let elapsed = now.timeIntervalSince(latest.confirmedAt)
        return max(0, TimeInterval(latest.restSeconds) - elapsed)
    }

    // MARK: - Transitions

    public func finish(sessionID: UUID, partial: Bool, at date: Date) throws {
        guard let session = try fetchSession(id: sessionID) else {
            throw RepositoryError.sessionNotFound
        }
        guard session.statusRaw == SessionStatus.inProgress.rawValue else {
            throw RepositoryError.invalidTransition
        }
        session.endedAt = date
        session.statusRaw = partial ? SessionStatus.partial.rawValue : SessionStatus.completed.rawValue
        try modelContext.save()
    }

    public func abandon(sessionID: UUID, at date: Date) throws {
        guard let session = try fetchSession(id: sessionID) else {
            throw RepositoryError.sessionNotFound
        }
        session.endedAt = date
        session.statusRaw = SessionStatus.abandoned.rawValue
        try modelContext.save()
    }

    public func deleteAll() throws {
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.WorkoutSessionEntity>()
        ) { modelContext.delete(entity) }
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.ExerciseEntity>()
        ) { modelContext.delete(entity) }
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.PlanDayEntity>()
        ) { modelContext.delete(entity) }
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.UserProfileEntity>()
        ) { modelContext.delete(entity) }
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.BodyMeasurementEntity>()
        ) { modelContext.delete(entity) }
        for entity in try modelContext.fetch(
            FetchDescriptor<SchemaV1.ActivityRecordEntity>()
        ) { modelContext.delete(entity) }
        try modelContext.save()
    }

    // MARK: - Backup (data-model.md §9)

    public func exportBackup(appVersion: String, at date: Date) throws -> BackupDocument {
        let exercises = try modelContext.fetch(FetchDescriptor<SchemaV1.ExerciseEntity>()).map { try $0.toDomain() }
        let planDays = try modelContext.fetch(FetchDescriptor<SchemaV1.PlanDayEntity>()).map { try $0.toDomain() }
        let sessions = try modelContext.fetch(FetchDescriptor<SchemaV1.WorkoutSessionEntity>()).map { try $0.toDomain() }
        let measurements = try modelContext.fetch(FetchDescriptor<SchemaV1.BodyMeasurementEntity>()).map { try $0.toDomain() }
        let activities = try modelContext.fetch(FetchDescriptor<SchemaV1.ActivityRecordEntity>()).map { try $0.toDomain() }
        let profiles = try modelContext.fetch(FetchDescriptor<SchemaV1.UserProfileEntity>())

        let document = BackupDocument(
            appVersion: appVersion,
            exportedAt: date,
            profile: try profiles.first?.toDomain(),
            exercises: exercises,
            planDays: planDays,
            sessions: sessions,
            bodyMeasurements: measurements,
            activities: activities
        )
        try document.validate()
        return document
    }

    /// Replaces the store only after the caller confirms. The document is fully
    /// validated first; an invalid one changes nothing (architecture.md §9).
    public func importBackup(_ document: BackupDocument, replacementConfirmed: Bool) throws {
        guard replacementConfirmed else { throw BackupError.replacementNotConfirmed }
        try document.validate()

        try deleteAll()

        if let profile = document.profile {
            modelContext.insert(SchemaV1.UserProfileEntity(domain: profile))
        }
        for exercise in document.exercises {
            modelContext.insert(SchemaV1.ExerciseEntity(domain: exercise))
        }
        for day in document.planDays {
            SchemaV1.PlanDayEntity.insert(day, into: modelContext)
        }
        for session in document.sessions {
            SchemaV1.WorkoutSessionEntity.insert(session, into: modelContext)
        }
        for measurement in document.bodyMeasurements {
            modelContext.insert(SchemaV1.BodyMeasurementEntity(domain: measurement))
        }
        for activity in document.activities {
            modelContext.insert(SchemaV1.ActivityRecordEntity(domain: activity))
        }
        try modelContext.save()
    }

    // MARK: - Helpers

    private func fetchSession(id: UUID) throws -> SchemaV1.WorkoutSessionEntity? {
        let descriptor = FetchDescriptor<SchemaV1.WorkoutSessionEntity>(
            predicate: #Predicate { $0.id == id }
        )
        return try modelContext.fetch(descriptor).first
    }
}
