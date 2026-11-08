import Foundation
import SwiftData
import RupfitCore

public enum MappingError: Error, Equatable {
    case invalidRawValue(field: String, value: String)
}

public struct PersistedPhase: Hashable, Sendable {
    public var phase: TrainingPhase
    public var passedBlocks: Int
    public var consecutiveFailures: Int
    public var blockBaselineKg: Double?
    public var startedAt: Date

    public init(phase: TrainingPhase, passedBlocks: Int, consecutiveFailures: Int,
                blockBaselineKg: Double?, startedAt: Date) {
        self.phase = phase
        self.passedBlocks = passedBlocks
        self.consecutiveFailures = consecutiveFailures
        self.blockBaselineKg = blockBaselineKg
        self.startedAt = startedAt
    }
}

// MARK: - Exercise

extension SchemaV1.ExerciseEntity {
    public convenience init(domain: Exercise) {
        self.init(
            id: domain.id,
            name: domain.name,
            primaryMuscleRaw: domain.primaryMuscle.rawValue,
            patternRaw: domain.pattern.rawValue,
            equipmentRaw: domain.equipment.rawValue,
            loadIncrementKg: domain.loadIncrementKg,
            isCustom: domain.isCustom,
            isArchived: domain.isArchived
        )
    }

    public func toDomain() throws -> Exercise {
        guard let muscle = MuscleGroup(rawValue: primaryMuscleRaw) else {
            throw MappingError.invalidRawValue(field: "primaryMuscle", value: primaryMuscleRaw)
        }
        guard let pattern = MovementPattern(rawValue: patternRaw) else {
            throw MappingError.invalidRawValue(field: "pattern", value: patternRaw)
        }
        guard let equipment = Equipment(rawValue: equipmentRaw) else {
            throw MappingError.invalidRawValue(field: "equipment", value: equipmentRaw)
        }
        return Exercise(
            id: id, name: name, primaryMuscle: muscle, pattern: pattern,
            equipment: equipment, loadIncrementKg: loadIncrementKg,
            isCustom: isCustom, isArchived: isArchived
        )
    }
}

// MARK: - Plan

extension SchemaV1.PlanItemEntity {
    public convenience init(domain: PlanItem) {
        self.init(
            id: domain.id, order: domain.order, exerciseID: domain.exerciseID,
            plannedSets: domain.prescription.sets,
            repLower: domain.prescription.repRange.lowerBound,
            repUpper: domain.prescription.repRange.upperBound,
            rirLower: domain.prescription.targetRIR.lowerBound,
            rirUpper: domain.prescription.targetRIR.upperBound,
            restSeconds: domain.prescription.restSeconds
        )
    }

    public func toDomain() throws -> PlanItem {
        PlanItem(
            id: id, order: order, exerciseID: exerciseID,
            prescription: ExercisePrescription(
                sets: plannedSets,
                repRange: repLower...repUpper,
                targetRIR: rirLower...rirUpper,
                restSeconds: restSeconds
            )
        )
    }
}

extension SchemaV1.PlanDayEntity {
    public convenience init(domain: PlanDay) {
        self.init(id: domain.id, name: domain.name, weekday: domain.weekday, order: domain.order)
    }

    /// Relationships are assigned only after both ends are inserted: SwiftData
    /// traps when an uninserted model is given a relationship (found at F4).
    @discardableResult
    public static func insert(_ domain: PlanDay, into context: ModelContext) -> SchemaV1.PlanDayEntity {
        let day = SchemaV1.PlanDayEntity(domain: domain)
        context.insert(day)
        for item in domain.items {
            let entity = SchemaV1.PlanItemEntity(domain: item)
            context.insert(entity)
            entity.day = day
        }
        return day
    }

    public func toDomain() throws -> PlanDay {
        PlanDay(
            id: id, name: name, weekday: weekday, order: order,
            items: try items.sorted { $0.order < $1.order }.map { try $0.toDomain() }
        )
    }
}

// MARK: - Profile and measurements

extension SchemaV1.UserProfileEntity {
    public convenience init(domain: UserProfile) {
        self.init(
            id: domain.id, displayName: domain.displayName,
            massUnitRaw: domain.massUnit.rawValue,
            weightGoalRaw: domain.weightGoal?.rawValue,
            weeklyTrainingDays: domain.weeklyTrainingDays,
            equipmentRaw: domain.availableEquipment.map(\.rawValue).sorted(),
            autoStartRestTimer: domain.autoStartRestTimer
        )
    }

    public func toDomain() throws -> UserProfile {
        guard let massUnit = MassUnit(rawValue: massUnitRaw) else {
            throw MappingError.invalidRawValue(field: "massUnit", value: massUnitRaw)
        }
        var goal: WeightGoal?
        if let weightGoalRaw {
            guard let parsed = WeightGoal(rawValue: weightGoalRaw) else {
                throw MappingError.invalidRawValue(field: "weightGoal", value: weightGoalRaw)
            }
            goal = parsed
        }
        var equipment: Set<Equipment> = []
        for raw in equipmentRaw {
            guard let value = Equipment(rawValue: raw) else {
                throw MappingError.invalidRawValue(field: "equipment", value: raw)
            }
            equipment.insert(value)
        }
        return UserProfile(
            id: id, displayName: displayName, massUnit: massUnit, weightGoal: goal,
            weeklyTrainingDays: weeklyTrainingDays, availableEquipment: equipment,
            autoStartRestTimer: autoStartRestTimer
        )
    }
}

extension SchemaV1.BodyMeasurementEntity {
    public convenience init(domain: BodyMeasurement) {
        self.init(
            id: domain.id, date: domain.date, weightKg: domain.weightKg,
            waistCm: domain.waistCm, chestCm: domain.chestCm, armCm: domain.armCm,
            thighCm: domain.thighCm, hipCm: domain.hipCm,
            bodyFatPercent: domain.bodyFatPercent,
            provenanceRaw: domain.provenance.rawValue
        )
    }

    public func toDomain() throws -> BodyMeasurement {
        guard let provenance = Provenance(rawValue: provenanceRaw) else {
            throw MappingError.invalidRawValue(field: "provenance", value: provenanceRaw)
        }
        let measurement = BodyMeasurement(
            id: id, date: date, weightKg: weightKg, waistCm: waistCm, chestCm: chestCm,
            armCm: armCm, thighCm: thighCm, hipCm: hipCm,
            bodyFatPercent: bodyFatPercent, provenance: provenance
        )
        guard measurement.isValid else {
            throw MappingError.invalidRawValue(field: "measurement", value: "empty")
        }
        return measurement
    }
}

extension SchemaV1.ActivityRecordEntity {
    public convenience init(domain: ActivityRecord) {
        self.init(
            id: domain.id, date: domain.date, kindRaw: domain.kind.rawValue,
            durationSeconds: domain.durationSeconds, activeEnergyKcal: domain.activeEnergyKcal,
            provenanceRaw: domain.provenance.rawValue, healthKitSampleID: domain.healthKitSampleID
        )
    }

    public func toDomain() throws -> ActivityRecord {
        guard let kind = ActivityKind(rawValue: kindRaw) else {
            throw MappingError.invalidRawValue(field: "kind", value: kindRaw)
        }
        guard let provenance = Provenance(rawValue: provenanceRaw) else {
            throw MappingError.invalidRawValue(field: "provenance", value: provenanceRaw)
        }
        return ActivityRecord(
            id: id, date: date, kind: kind, durationSeconds: durationSeconds,
            activeEnergyKcal: activeEnergyKcal, provenance: provenance,
            healthKitSampleID: healthKitSampleID
        )
    }
}

// MARK: - Phase

extension SchemaV1.PhaseStateEntity {
    public convenience init(domain: PersistedPhase, id: UUID = UUID()) {
        let kind: String
        let week: Int?
        switch domain.phase {
        case .readaptation(let value):
            kind = "readaptation"
            week = value
        case .normal:
            kind = "normal"
            week = nil
        }
        self.init(
            id: id, phaseKindRaw: kind, phaseWeek: week,
            passedBlocks: domain.passedBlocks,
            consecutiveFailures: domain.consecutiveFailures,
            blockBaselineKg: domain.blockBaselineKg,
            startedAt: domain.startedAt
        )
    }

    public func toDomain() throws -> PersistedPhase {
        let phase: TrainingPhase
        switch phaseKindRaw {
        case "readaptation":
            phase = .readaptation(week: phaseWeek ?? 1)
        case "normal":
            phase = .normal
        default:
            throw MappingError.invalidRawValue(field: "phase", value: phaseKindRaw)
        }
        return PersistedPhase(
            phase: phase, passedBlocks: passedBlocks,
            consecutiveFailures: consecutiveFailures,
            blockBaselineKg: blockBaselineKg, startedAt: startedAt
        )
    }
}

// MARK: - Sets and exercises

extension SchemaV1.SetRecordEntity {
    public convenience init(domain: SetRecord) {
        self.init(
            id: domain.id, index: domain.index, weightKg: domain.weightKg,
            targetReps: domain.targetReps, actualReps: domain.actualReps,
            effortRaw: domain.effort?.rawValue,
            discomfortRaw: domain.discomfort?.rawValue,
            confirmedAt: domain.confirmedAt
        )
    }

    public func toDomain() throws -> SetRecord {
        if let effortRaw, Effort(rawValue: effortRaw) == nil {
            throw MappingError.invalidRawValue(field: "effort", value: String(effortRaw))
        }
        if let discomfortRaw, Discomfort(rawValue: discomfortRaw) == nil {
            throw MappingError.invalidRawValue(field: "discomfort", value: String(discomfortRaw))
        }
        return SetRecord(
            id: id, index: index, weightKg: weightKg, targetReps: targetReps,
            actualReps: actualReps,
            effort: effortRaw.flatMap(Effort.init(rawValue:)),
            discomfort: discomfortRaw.flatMap(Discomfort.init(rawValue:)),
            confirmedAt: confirmedAt
        )
    }
}

extension SchemaV1.ExerciseSessionEntity {
    public convenience init(domain: ExerciseSession) {
        self.init(
            id: domain.id, order: domain.order, exerciseID: domain.exerciseID,
            exerciseNameSnapshot: domain.exerciseNameSnapshot,
            plannedSets: domain.prescription.sets,
            repLower: domain.prescription.repRange.lowerBound,
            repUpper: domain.prescription.repRange.upperBound,
            rirLower: domain.prescription.targetRIR.lowerBound,
            rirUpper: domain.prescription.targetRIR.upperBound,
            restSeconds: domain.prescription.restSeconds,
            statusRaw: domain.status.rawValue,
            completedAt: domain.completedAt
        )
        if let recommendation = domain.recommendation {
            recWeightKg = recommendation.suggestedWeightKg
            recSets = recommendation.suggestedSets
            recTargetReps = recommendation.suggestedTargetReps
            recActionRaw = recommendation.action.rawValue
            recReasonRaw = recommendation.reason.rawValue
            recConfidenceRaw = recommendation.confidence.level.rawValue
            recConfidenceSessions = recommendation.confidence.sessionsConsidered
            recBasedOnSessions = recommendation.basedOnSessions
            recComputedAt = recommendation.computedAt
        }
        switch domain.decision {
        case .accepted:
            decisionRaw = "accepted"
        case .repeated:
            decisionRaw = "repeated"
        case .manual(let kg):
            decisionRaw = "manual"
            decisionManualKg = kg
        case nil:
            decisionRaw = nil
        }
        recommendedWeightKg = domain.recommendedWeightKg
        usedWeightKg = domain.usedWeightKg
        loadDeltaKg = domain.loadDeltaKg
    }

    @discardableResult
    public static func insert(
        _ domain: ExerciseSession,
        into context: ModelContext
    ) -> SchemaV1.ExerciseSessionEntity {
        let exercise = SchemaV1.ExerciseSessionEntity(domain: domain)
        context.insert(exercise)
        for record in domain.sets {
            let entity = SchemaV1.SetRecordEntity(domain: record)
            context.insert(entity)
            entity.exercise = exercise
        }
        return exercise
    }

    public func toDomain() throws -> ExerciseSession {
        let prescription = ExercisePrescription(
            sets: plannedSets,
            repRange: repLower...repUpper,
            targetRIR: rirLower...rirUpper,
            restSeconds: restSeconds
        )

        var recommendation: ProgressionRecommendation?
        if let recActionRaw, let recReasonRaw, let recComputedAt,
           let action = ProgressionAction(rawValue: recActionRaw),
           let reason = ReasonCode(rawValue: recReasonRaw),
           let levelRaw = recConfidenceRaw,
           let level = Confidence.Level(rawValue: levelRaw) {
            recommendation = ProgressionRecommendation(
                suggestedWeightKg: recWeightKg,
                suggestedSets: recSets ?? plannedSets,
                suggestedTargetReps: recTargetReps ?? prescription.repRange.lowerBound,
                action: action,
                reason: reason,
                confidence: Confidence(level: level, sessionsConsidered: recConfidenceSessions ?? 0),
                basedOnSessions: recBasedOnSessions ?? 0,
                computedAt: recComputedAt
            )
        }

        let decision: LoadDecision?
        switch decisionRaw {
        case "accepted":
            decision = .accepted
        case "repeated":
            decision = .repeated
        case "manual":
            guard let decisionManualKg else {
                throw MappingError.invalidRawValue(field: "decision", value: "manual without kg")
            }
            decision = .manual(kg: decisionManualKg)
        case nil:
            decision = nil
        default:
            throw MappingError.invalidRawValue(field: "decision", value: decisionRaw ?? "")
        }

        guard let status = ExerciseStatus(rawValue: statusRaw) else {
            throw MappingError.invalidRawValue(field: "exerciseStatus", value: statusRaw)
        }

        var session = ExerciseSession(
            id: id, order: order, exerciseID: exerciseID,
            exerciseNameSnapshot: exerciseNameSnapshot, prescription: prescription,
            recommendation: recommendation, sets: [], status: status, completedAt: completedAt
        )
        session.sets = try setRecords.sorted { $0.index < $1.index }.map { try $0.toDomain() }
        if let decision {
            guard let usedWeightKg else {
                throw MappingError.invalidRawValue(field: "usedWeightKg", value: "missing")
            }
            session.decide(decision, recommendedKg: recommendedWeightKg, usedKg: usedWeightKg)
        }
        return session
    }
}

extension SchemaV1.WorkoutSessionEntity {
    public convenience init(domain: WorkoutSession) {
        self.init(
            id: domain.id, planDayID: domain.planDayID,
            dayNameSnapshot: domain.dayNameSnapshot,
            scheduledDate: domain.scheduledDate,
            startedAt: domain.startedAt, endedAt: domain.endedAt,
            phaseKindRaw: {
                switch domain.phase {
                case .readaptation: return "readaptation"
                case .normal: return "normal"
                }
            }(),
            phaseWeek: {
                switch domain.phase {
                case .readaptation(let week): return week
                case .normal: return nil
                }
            }(),
            statusRaw: domain.status.rawValue
        )
    }

    @discardableResult
    public static func insert(
        _ domain: WorkoutSession,
        into context: ModelContext
    ) -> SchemaV1.WorkoutSessionEntity {
        let session = SchemaV1.WorkoutSessionEntity(domain: domain)
        context.insert(session)
        for exercise in domain.exercises {
            let entity = SchemaV1.ExerciseSessionEntity.insert(exercise, into: context)
            entity.session = session
        }
        return session
    }

    public func toDomain() throws -> WorkoutSession {
        let phase: TrainingPhase
        switch phaseKindRaw {
        case "readaptation":
            phase = .readaptation(week: phaseWeek ?? 1)
        case "normal":
            phase = .normal
        default:
            throw MappingError.invalidRawValue(field: "phase", value: phaseKindRaw)
        }
        guard let status = SessionStatus(rawValue: statusRaw) else {
            throw MappingError.invalidRawValue(field: "sessionStatus", value: statusRaw)
        }
        return WorkoutSession(
            id: id, planDayID: planDayID, dayNameSnapshot: dayNameSnapshot,
            scheduledDate: scheduledDate, startedAt: startedAt, endedAt: endedAt,
            phase: phase, status: status,
            exercises: try exercises.sorted { $0.order < $1.order }.map { try $0.toDomain() }
        )
    }
}
