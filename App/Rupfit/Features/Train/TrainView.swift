import SwiftUI
import RupfitCore

@MainActor
struct TrainView: View {
    let container: AppContainer
    @State private var active: SessionModel?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.m) {
                    Text("Entrenar")
                        .font(RupfitFont.screenTitle)
                    if container.planDays.isEmpty {
                        EmptyStateView(text: "Todavía no hay días de entrenamiento en el plan.")
                    } else {
                        ForEach(container.planDays) { day in
                            SurfaceCard {
                                VStack(alignment: .leading, spacing: Space.xs) {
                                    Text(day.name)
                                        .font(.title3.weight(.semibold))
                                    Text("\(day.items.count) ejercicios · \(weekdayName(day.weekday))")
                                        .font(RupfitFont.meta)
                                        .foregroundStyle(RupfitColor.textSecondary)
                                    Button("Empezar") {
                                        start(day)
                                    }
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(RupfitColor.accentText)
                                    .padding(.top, Space.xxs)
                                }
                            }
                        }
                    }
                }
                .padding(Space.l)
            }
            .background(RupfitColor.background)
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await container.start() }
        .fullScreenCover(item: $active) { SessionView(model: $0) }
    }

    private func weekdayName(_ weekday: Int) -> String {
        let names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        return names[min(max(weekday - 1, 0), 6)]
    }

    private func start(_ day: PlanDay) {
        guard let session = container.makeSession(for: day) else { return }
        active = SessionModel(session: session, store: container.store, exerciseMeta: container.exercises)
    }
}
