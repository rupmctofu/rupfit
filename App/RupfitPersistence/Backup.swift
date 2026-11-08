import Foundation
import SwiftData
import RupfitCore

/// The user-owned document of `data-model.md` §9. It is the domain structs encoded
/// as they are; import validates the whole document before touching the store.
public struct BackupDocument: Codable, Sendable, Equatable {
    public static let currentSchemaVersion = 1
    public static let documentTypeName = "rupfit.backup"

    public var documentType: String
    public var schemaVersion: Int
    public var appVersion: String
    public var exportedAt: Date
    public var profile: UserProfile?
    public var exercises: [Exercise]
    public var planDays: [PlanDay]
    public var sessions: [WorkoutSession]
    public var bodyMeasurements: [BodyMeasurement]
    public var activities: [ActivityRecord]

    public init(
        documentType: String = BackupDocument.documentTypeName,
        schemaVersion: Int = BackupDocument.currentSchemaVersion,
        appVersion: String,
        exportedAt: Date,
        profile: UserProfile?,
        exercises: [Exercise],
        planDays: [PlanDay],
        sessions: [WorkoutSession],
        bodyMeasurements: [BodyMeasurement],
        activities: [ActivityRecord]
    ) {
        self.documentType = documentType
        self.schemaVersion = schemaVersion
        self.appVersion = appVersion
        self.exportedAt = exportedAt
        self.profile = profile
        self.exercises = exercises
        self.planDays = planDays
        self.sessions = sessions
        self.bodyMeasurements = bodyMeasurements
        self.activities = activities
    }
}

public enum BackupError: Error, Equatable {
    case unsupportedDocumentType(String)
    case unsupportedSchemaVersion(Int)
    case duplicateIdentifier(String)
    case missingExerciseReference(UUID)
    case invalidValue(String)
    case replacementNotConfirmed
}

extension BackupDocument {
    /// Validates everything an import depends on. Throws without side effects.
    public func validate() throws {
        guard documentType == BackupDocument.documentTypeName else {
            throw BackupError.unsupportedDocumentType(documentType)
        }
        guard schemaVersion == BackupDocument.currentSchemaVersion else {
            throw BackupError.unsupportedSchemaVersion(schemaVersion)
        }

        try Self.requireUnique(exercises.map(\.id), label: "exercise")
        try Self.requireUnique(planDays.map(\.id), label: "planDay")
        try Self.requireUnique(planDays.flatMap { $0.items.map(\.id) }, label: "planItem")
        try Self.requireUnique(sessions.map(\.id), label: "session")
        try Self.requireUnique(sessions.flatMap { $0.exercises.map(\.id) }, label: "exerciseSession")
        try Self.requireUnique(sessions.flatMap { $0.exercises.flatMap { $0.sets.map(\.id) } }, label: "setRecord")
        try Self.requireUnique(bodyMeasurements.map(\.id), label: "measurement")
        try Self.requireUnique(activities.map(\.id), label: "activity")

        let exerciseIDs = Set(exercises.map(\.id))
        for day in planDays {
            for item in day.items where !exerciseIDs.contains(item.exerciseID) {
                throw BackupError.missingExerciseReference(item.exerciseID)
            }
        }
        for session in sessions {
            for exercise in session.exercises {
                if let exerciseID = exercise.exerciseID, !exerciseIDs.contains(exerciseID) {
                    throw BackupError.missingExerciseReference(exerciseID)
                }
            }
        }

        for exercise in exercises {
            guard exercise.loadIncrementKg >= 0 else {
                throw BackupError.invalidValue("loadIncrementKg")
            }
        }
        for session in sessions {
            for exercise in session.exercises {
                for set in exercise.sets {
                    guard set.weightKg >= 0, set.actualReps >= 0, set.targetReps > 0 else {
                        throw BackupError.invalidValue("setRecord")
                    }
                }
            }
        }
        for measurement in bodyMeasurements where !measurement.isValid {
            throw BackupError.invalidValue("bodyMeasurement")
        }
    }

    private static func requireUnique(_ ids: [UUID], label: String) throws {
        if Set(ids).count != ids.count {
            throw BackupError.duplicateIdentifier(label)
        }
    }
}
