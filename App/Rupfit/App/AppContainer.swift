import Foundation
import Observation
import SwiftData
import RupfitCore
import RupfitPersistence

/// Composition root: container, repository, the seeded plan and the phase.
/// Views never touch SwiftData (architecture.md §4).
@MainActor
@Observable
final class AppContainer {
    let store: SessionRepository
    private(set) var planDays: [PlanDay] = []
    private(set) var exercises: [UUID: Exercise] = [:]
    private(set) var loadError: String?
    let phase: TrainingPhase = .readaptation(week: 1)
    let now: () -> Date
    private var started = false

    init(now: @escaping () -> Date = Date.init) throws {
        let configuration = ModelConfiguration()
        let container = try ModelContainer(
            for: Schema(versionedSchema: SchemaV1.self),
            migrationPlan: RupfitMigrationPlan.self,
            configurations: configuration
        )
        self.store = SessionRepository(modelContainer: container)
        self.now = now
    }

    func start() async {
        guard !started else { return }
        started = true
        do {
            if ProcessInfo.processInfo.arguments.contains("-uiTestReset") {
                try await store.deleteAll()
            }
            try await seedIfNeeded()
            planDays = try await store.planDays()
            exercises = Dictionary(uniqueKeysWithValues: try await store.exercises().map { ($0.id, $0) })
        } catch {
            loadError = error.localizedDescription
        }
    }

    func todayPlan() -> PlanDay? {
        planDays.first(where: { $0.weekday == mondayBasedWeekday() })
    }

    /// The next planned day, so a rest day never shows a dead screen.
    func nextPlan() -> PlanDay? {
        let today = mondayBasedWeekday()
        let upcoming = planDays
            .filter { $0.weekday >= today }
            .min { $0.weekday < $1.weekday }
        return upcoming ?? planDays.min { $0.weekday < $1.weekday }
    }

    func isToday(_ day: PlanDay) -> Bool {
        day.weekday == mondayBasedWeekday()
    }

    private func mondayBasedWeekday() -> Int {
        let weekday = Calendar.current.component(.weekday, from: now())
        return weekday == 1 ? 7 : weekday - 1
    }

    /// Creates the session locally **and** persists it before the screen opens; a
    /// confirmed set that the store does not know about is not a confirmed set.
    func beginSession(for day: PlanDay) async -> SessionModel? {
        guard let session = makeSession(for: day) else { return nil }
        do {
            try await store.createSession(session)
        } catch {
            loadError = "No se pudo crear la sesión: \(error.localizedDescription)"
            return nil
        }
        return SessionModel(session: session, store: store, exerciseMeta: exercises)
    }

    func makeSession(for day: PlanDay) -> WorkoutSession? {
        let engine = ProgressionEngine()
        var sessions: [ExerciseSession] = []
        for item in day.items {
            guard let exercise = exercises[item.exerciseID] else { continue }
            let recommendation = engine.recommend(
                ProgressionInput(
                    exercise: exercise,
                    prescription: item.prescription,
                    phase: phase,
                    history: []
                ),
                now: now()
            )
            sessions.append(
                ExerciseSession(
                    order: item.order,
                    exerciseID: exercise.id,
                    exerciseNameSnapshot: exercise.name,
                    prescription: item.prescription,
                    recommendation: recommendation
                )
            )
        }
        guard !sessions.isEmpty else { return nil }
        return WorkoutSession(
            planDayID: day.id,
            dayNameSnapshot: day.name,
            scheduledDate: now(),
            phase: phase,
            status: .scheduled,
            exercises: sessions
        )
    }

    // MARK: - First-run seed

    /// The three-day template of FR-3.1, seeded once so the app opens with a plan
    /// instead of an empty shell. It is the user's plan, not sample history.
    private func seedIfNeeded() async throws {
        guard try await store.planDays().isEmpty else { return }
        let squat = Exercise(name: "Sentadilla trasera", primaryMuscle: .quadriceps,
                             pattern: .squat, equipment: .barbell, loadIncrementKg: 2.5)
        let deadlift = Exercise(name: "Peso muerto convencional", primaryMuscle: .hamstrings,
                                pattern: .hinge, equipment: .barbell, loadIncrementKg: 2.5)
        let bench = Exercise(name: "Press banca", primaryMuscle: .chest,
                             pattern: .horizontalPush, equipment: .barbell, loadIncrementKg: 2.5)
        let legPress = Exercise(name: "Prensa de piernas", primaryMuscle: .quadriceps,
                                pattern: .squat, equipment: .machine, loadIncrementKg: 5)
        let row = Exercise(name: "Remo con barra", primaryMuscle: .upperBack,
                           pattern: .horizontalPull, equipment: .barbell, loadIncrementKg: 2.5)
        let shoulderPress = Exercise(name: "Press de hombro", primaryMuscle: .shoulders,
                                     pattern: .verticalPush, equipment: .dumbbell, loadIncrementKg: 2)
        for exercise in [squat, deadlift, bench, legPress, row, shoulderPress] {
            try await store.upsertExercise(exercise)
        }
        let primary = ExercisePrescription(sets: 3, repRange: 8...12, targetRIR: 3...4, restSeconds: 180)
        let accessory = ExercisePrescription(sets: 2, repRange: 10...15, targetRIR: 2...3, restSeconds: 120)
        let days = [
            PlanDay(name: "SENTADILLA / PIERNA", weekday: 1, order: 1, items: [
                PlanItem(order: 1, exerciseID: squat.id, prescription: primary),
                PlanItem(order: 2, exerciseID: legPress.id, prescription: accessory),
            ]),
            PlanDay(name: "PESO MUERTO / TRACCIÓN", weekday: 3, order: 2, items: [
                PlanItem(order: 1, exerciseID: deadlift.id, prescription: primary),
                PlanItem(order: 2, exerciseID: row.id, prescription: accessory),
            ]),
            PlanDay(name: "PRESS BANCA / EMPUJE", weekday: 5, order: 3, items: [
                PlanItem(order: 1, exerciseID: bench.id, prescription: primary),
                PlanItem(order: 2, exerciseID: shoulderPress.id, prescription: accessory),
            ]),
        ]
        for day in days { try await store.upsertPlanDay(day) }
    }
}
