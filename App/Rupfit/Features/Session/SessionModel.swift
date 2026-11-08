import Foundation
import Observation
import RupfitCore
import RupfitPersistence

@MainActor
@Observable
final class SessionModel: Identifiable {
    let id: UUID
    private(set) var session: WorkoutSession
    let exerciseMeta: [UUID: Exercise]
    private let store: SessionRepository
    private let now: () -> Date

    var currentIndex = 0
    private(set) var errorMessage: String?
    private(set) var restEndsAt: Date?
    private(set) var finished = false

    init(
        session: WorkoutSession,
        store: SessionRepository,
        exerciseMeta: [UUID: Exercise],
        now: @escaping () -> Date = Date.init
    ) {
        self.id = session.id
        self.session = session
        self.store = store
        self.exerciseMeta = exerciseMeta
        self.now = now
    }

    var currentExercise: ExerciseSession { session.exercises[currentIndex] }
    var prescribedSets: Int { currentExercise.prescription.sets }
    var hasDecision: Bool { currentExercise.decision != nil }
    var suggestedWeightKg: Double? { currentExercise.recommendation?.suggestedWeightKg }
    var usedWeightKg: Double? { currentExercise.usedWeightKg }
    var incrementKg: Double {
        currentExercise.exerciseID.flatMap { exerciseMeta[$0]?.loadIncrementKg } ?? 2.5
    }
    var nextSetNumber: Int { currentExercise.sets.count + 1 }
    var allExercisesDone: Bool {
        session.exercises.allSatisfy { $0.sets.count >= $0.prescription.sets }
    }
    var totalSets: Int { session.exercises.reduce(0) { $0 + $1.sets.count } }

    var exerciseName: String { currentExercise.exerciseNameSnapshot }
    var reasonText: String {
        guard let reason = currentExercise.recommendation?.reason else {
            return "Sin historial en este ejercicio. Elige un peso con el que puedas hacer unas 15 repeticiones."
        }
        switch reason {
        case .insufficientData:
            return "Sin historial en este ejercicio. Elige un peso con el que puedas hacer unas 15 repeticiones."
        case .coldStartFromCalibration:
            return "Partimos de tu referencia, rebajada un 30 %."
        case .topOfRangeReached, .topOfRangeReachedEffortUnknown:
            return "Completaste todas las series al tope. Subimos un incremento."
        case .addRepetition:
            return "Vas bien: mantenemos el peso y buscamos una repetición más."
        case .belowRangeFirstTime:
            return "No llegaste al mínimo en alguna serie. Repetimos el peso."
        case .belowRangeRepeated:
            return "Dos sesiones por debajo del mínimo. Bajamos un incremento."
        case .discomfortHold:
            return "Registraste molestias. Mantenemos el peso."
        case .discomfortReduce:
            return "Registraste dolor. Bajamos un incremento y conviene cambiar de ejercicio."
        case .userLoweredLastTime:
            return "La última sesión la hiciste a tu aire. Consolidamos ese peso."
        case .readaptationBlockPassed:
            return "Bloque superado. Mantenemos el peso y subimos el volumen."
        case .readaptationBlockNotPassed:
            return "Repetimos el bloque: falta algún criterio."
        case .readaptationCapReached:
            return "Ocho semanas de readaptación. Mantengo el peso y toca revisar el plan."
        case .bodyweightTopOfRange:
            return "Llegaste al tope sin peso. Toca una variante más difícil."
        }
    }

    // MARK: - Decisions

    func accept() async {
        guard let suggested = suggestedWeightKg else { return }
        await apply(.accepted, used: suggested)
    }

    func setManualWeight(_ kg: Double) async {
        guard kg > 0 else { return }
        await apply(.manual(kg: kg), used: kg)
    }

    func adjustWeight(by delta: Double) async {
        let base = usedWeightKg ?? suggestedWeightKg ?? 0
        let next = max(incrementKg, base + delta)
        await apply(.manual(kg: next), used: next)
    }

    private func apply(_ decision: LoadDecision, used: Double) async {
        let recommended = suggestedWeightKg
        session.exercises[currentIndex].decide(
            decision, recommendedKg: recommended, usedKg: used
        )
        do {
            try await store.recordDecision(
                sessionID: session.id,
                exerciseID: currentExercise.id,
                decision: decision,
                recommendedKg: recommended,
                usedKg: used
            )
            errorMessage = nil
        } catch {
            errorMessage = "No se pudo guardar la decisión de peso."
        }
    }

    // MARK: - Sets

    func confirmSet(reps: Int, effort: Effort?, discomfort: Discomfort?) async {
        guard let used = usedWeightKg else {
            errorMessage = "Elige un peso antes de registrar la serie."
            return
        }
        let record = SetRecord(
            index: nextSetNumber, weightKg: used,
            targetReps: currentExercise.prescription.repRange.lowerBound,
            actualReps: reps, effort: effort, discomfort: discomfort,
            confirmedAt: now()
        )
        do {
            try await store.confirmSet(
                sessionID: session.id, exerciseID: currentExercise.id, set: record
            )
            session.exercises[currentIndex].sets.append(record)
            session.exercises[currentIndex].status = .active
            if session.startedAt == nil { session.startedAt = record.confirmedAt }
            session.status = .inProgress
            restEndsAt = record.confirmedAt.addingTimeInterval(
                TimeInterval(currentExercise.prescription.restSeconds)
            )
            errorMessage = nil
        } catch {
            errorMessage = "No se pudo guardar la serie. Reintentar."
        }
    }

    // MARK: - Rest

    func remainingRest(at date: Date) -> TimeInterval? {
        guard let restEndsAt else { return nil }
        return max(0, restEndsAt.timeIntervalSince(date))
    }

    func addRest() { restEndsAt = restEndsAt?.addingTimeInterval(15) }
    func skipRest() { restEndsAt = nil }

    // MARK: - Finish

    func finish(partial: Bool) async {
        guard totalSets > 0 else {
            errorMessage = "Registra al menos una serie para terminar."
            return
        }
        do {
            try await store.finish(sessionID: session.id, partial: partial, at: now())
            session.status = partial ? .partial : .completed
            session.endedAt = now()
            restEndsAt = nil
            finished = true
        } catch {
            errorMessage = "No se pudo cerrar la sesión."
        }
    }

    func duration(at date: Date) -> TimeInterval {
        guard let started = session.startedAt else { return 0 }
        return (session.endedAt ?? date).timeIntervalSince(started)
    }

    func volume() -> Double {
        Statistics.sessionVolume(session.exercises.flatMap(\.sets))
    }
}
