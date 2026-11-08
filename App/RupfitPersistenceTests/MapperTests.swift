import XCTest
import SwiftData
import RupfitCore
@testable import RupfitPersistence

/// Mapper round-trips, both directions, for every entity (roadmap F4 exit gate).
final class MapperTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_760_000_000)

    func makeContext() throws -> ModelContext {
        let configuration = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: Schema(versionedSchema: SchemaV1.self),
            migrationPlan: RupfitMigrationPlan.self,
            configurations: configuration
        )
        return ModelContext(container)
    }

    func roundTrip<T: PersistentModel, Domain: Equatable>(
        _ entity: T,
        in context: ModelContext,
        fetch: FetchDescriptor<T>,
        map: (T) throws -> Domain,
        expected: Domain
    ) throws -> Domain {
        context.insert(entity)
        try context.save()
        let loaded = try XCTUnwrap(try context.fetch(fetch).first)
        let domain = try map(loaded)
        XCTAssertEqual(domain, expected)
        return domain
    }

    func roundTripPlanDay(_ day: PlanDay, in context: ModelContext) throws -> PlanDay {
        SchemaV1.PlanDayEntity.insert(day, into: context)
        try context.save()
        let loaded = try XCTUnwrap(try context.fetch(FetchDescriptor<SchemaV1.PlanDayEntity>()).first)
        let domain = try loaded.toDomain()
        XCTAssertEqual(domain, day)
        return domain
    }

    func roundTripSession(_ session: WorkoutSession, in context: ModelContext) throws -> WorkoutSession {
        SchemaV1.WorkoutSessionEntity.insert(session, into: context)
        try context.save()
        let loaded = try XCTUnwrap(try context.fetch(FetchDescriptor<SchemaV1.WorkoutSessionEntity>()).first)
        let domain = try loaded.toDomain()
        XCTAssertEqual(domain, session)
        return domain
    }

    func testExerciseRoundTrip() throws {
        let context = try makeContext()
        let exercise = Exercise(
            name: "Peso muerto convencional", primaryMuscle: .hamstrings, pattern: .hinge,
            equipment: .barbell, loadIncrementKg: 2.5
        )
        let entity = SchemaV1.ExerciseEntity(domain: exercise)
        _ = try roundTrip(
            entity, in: context,
            fetch: FetchDescriptor<SchemaV1.ExerciseEntity>(),
            map: { try $0.toDomain() },
            expected: exercise
        )
    }

    func testPlanDayWithItemsRoundTrip() throws {
        let context = try makeContext()
        let items = [
            PlanItem(order: 1, exerciseID: UUID(),
                     prescription: ExercisePrescription(
                        sets: 4, repRange: 6...10, targetRIR: 1...3, restSeconds: 180)),
            PlanItem(order: 2, exerciseID: UUID(),
                     prescription: ExercisePrescription(sets: 3, repRange: 10...15, targetRIR: 2...3, restSeconds: 120)),
        ]
        let day = PlanDay(name: "SENTADILLA / PIERNA", weekday: 1, order: 1, items: items)
        _ = try roundTripPlanDay(day, in: context)
    }

    func testProfileRoundTrip() throws {
        let context = try makeContext()
        let profile = UserProfile(
            displayName: "Rup", massUnit: .kilograms, weightGoal: .maintain,
            weeklyTrainingDays: 3, availableEquipment: [.barbell, .dumbbell]
        )
        _ = try roundTrip(
            SchemaV1.UserProfileEntity(domain: profile), in: context,
            fetch: FetchDescriptor<SchemaV1.UserProfileEntity>(),
            map: { try $0.toDomain() },
            expected: profile
        )
    }

    func testBodyMeasurementRoundTrip() throws {
        let context = try makeContext()
        let measurement = BodyMeasurement(date: now, weightKg: 78.4, waistCm: 84, provenance: .healthKit)
        _ = try roundTrip(
            SchemaV1.BodyMeasurementEntity(domain: measurement), in: context,
            fetch: FetchDescriptor<SchemaV1.BodyMeasurementEntity>(),
            map: { try $0.toDomain() },
            expected: measurement
        )
    }

    func testActivityRoundTrip() throws {
        let context = try makeContext()
        let activity = ActivityRecord(
            date: now, kind: .cardio, durationSeconds: 3_600, activeEnergyKcal: 420,
            provenance: .healthKit, healthKitSampleID: UUID()
        )
        _ = try roundTrip(
            SchemaV1.ActivityRecordEntity(domain: activity), in: context,
            fetch: FetchDescriptor<SchemaV1.ActivityRecordEntity>(),
            map: { try $0.toDomain() },
            expected: activity
        )
    }

    func testPhaseRoundTrip() throws {
        let context = try makeContext()
        let phase = PersistedPhase(
            phase: .readaptation(week: 3), passedBlocks: 2, consecutiveFailures: 1,
            blockBaselineKg: 92.5, startedAt: now
        )
        _ = try roundTrip(
            SchemaV1.PhaseStateEntity(domain: phase), in: context,
            fetch: FetchDescriptor<SchemaV1.PhaseStateEntity>(),
            map: { try $0.toDomain() },
            expected: phase
        )
    }

    func testSessionRoundTripKeepsFrozenRecommendationAndDelta() throws {
        let context = try makeContext()
        let exerciseID = UUID()
        let prescription = ExercisePrescription(sets: 3, repRange: 8...12, targetRIR: 3...4, restSeconds: 180)
        let recommendation = ProgressionRecommendation(
            suggestedWeightKg: 92.5, suggestedSets: 3, suggestedTargetReps: 10,
            action: .increase, reason: .readaptationBlockPassed,
            confidence: .medium(2), basedOnSessions: 2, computedAt: now
        )
        var exercise = ExerciseSession(
            order: 1, exerciseID: exerciseID, exerciseNameSnapshot: "Peso muerto",
            prescription: prescription, recommendation: recommendation
        )
        exercise.decide(.manual(kg: 90), recommendedKg: 92.5, usedKg: 90)
        exercise.sets = [
            SetRecord(index: 1, weightKg: 90, targetReps: 10, actualReps: 10,
                      effort: .correct, discomfort: Discomfort.none, confirmedAt: now),
            SetRecord(index: 2, weightKg: 90, targetReps: 10, actualReps: 9,
                      effort: .failure, discomfort: .mild, confirmedAt: now.addingTimeInterval(120)),
        ]
        exercise.status = .active
        let session = WorkoutSession(
            planDayID: UUID(), dayNameSnapshot: "MIÉRCOLES / TRACCIÓN",
            scheduledDate: now, startedAt: now, phase: .readaptation(week: 2),
            status: .inProgress, exercises: [exercise]
        )
        _ = try roundTripSession(session, in: context)
    }
}
