import SwiftUI
import RupfitCore

@MainActor
struct HomeView: View {
    let container: AppContainer
    @State private var active: SessionModel?

    private let weekdays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.m) {
                    header
                    if let error = container.loadError {
                        ErrorBannerView(text: error)
                    }
                    todaySection
                    lastSession
                    weekCard
                    weightCard
                }
                .padding(Space.l)
            }
            .background(RupfitColor.background)
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            await container.start()
            if ProcessInfo.processInfo.arguments.contains("-uiTestSession"),
               active == nil, let day = container.nextPlan() {
                start(day)
            }
        }
        .fullScreenCover(item: $active) { model in
            SessionView(model: model)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Hola, Rup")
                .font(RupfitFont.screenTitle)
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(RupfitFont.caption)
                .foregroundStyle(RupfitColor.textSecondary)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var todaySection: some View {
        Text("HOY TOCA")
            .font(RupfitFont.label)
            .foregroundStyle(RupfitColor.textSecondary)
            .padding(.top, Space.xs)

        if let day = container.nextPlan() {
            SurfaceCard {
                VStack(alignment: .leading, spacing: Space.s) {
                    Text(container.isToday(day) ? "HOY" : "PRÓXIMA SESIÓN")
                        .font(RupfitFont.label)
                        .foregroundStyle(RupfitColor.accentText)
                    Text(day.name)
                        .font(RupfitFont.cardTitle)
                    Text("\(day.items.count) ejercicios · readaptación semana 1")
                        .font(RupfitFont.meta)
                        .foregroundStyle(RupfitColor.textSecondary)
                    PrimaryButton(title: "Empezar entrenamiento", systemImage: "play.fill") {
                        start(day)
                    }
                    .padding(.top, Space.xs)
                }
            }
        } else {
            EmptyStateView(text: "Todavía no hay días en el plan.")
        }
    }

    private var lastSession: some View {
        SurfaceCard(padding: Space.m) {
            VStack(alignment: .leading, spacing: Space.xs) {
                Label("Última sesión", systemImage: "dumbbell")
                    .font(RupfitFont.label)
                    .foregroundStyle(RupfitColor.textSecondary)
                EmptyStateView(text: "Todavía no hay sesiones. La primera aparecerá aquí cuando la termines.")
                    .padding(.top, Space.xxs)
            }
        }
    }

    private var weekCard: some View {
        SurfaceCard(padding: Space.m) {
            VStack(alignment: .leading, spacing: Space.s) {
                Label("Esta semana", systemImage: "calendar")
                    .font(RupfitFont.label)
                    .foregroundStyle(RupfitColor.textSecondary)
                HStack(spacing: Space.xs) {
                    ForEach(weekdays.indices, id: \.self) { index in
                        let isTraining = container.planDays.contains { $0.weekday == index + 1 }
                        VStack(spacing: 4) {
                            Text(weekdays[index])
                                .font(.caption2)
                                .foregroundStyle(RupfitColor.textTertiary)
                            Text(isTraining ? "·" : "–")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(isTraining ? RupfitColor.accentText : RupfitColor.textTertiary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(isToday(index) ? RupfitColor.accentMuted : RupfitColor.raised)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                                .stroke(isToday(index) ? RupfitColor.accent : .clear, lineWidth: 1)
                        )
                    }
                }
                Text("0 de 3 sesiones · sin series todavía")
                    .font(RupfitFont.caption)
                    .foregroundStyle(RupfitColor.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var weightCard: some View {
        SurfaceCard(padding: Space.m) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Label("Peso corporal", systemImage: "chart.bar")
                        .font(RupfitFont.label)
                        .foregroundStyle(RupfitColor.textSecondary)
                    Text("—")
                        .font(RupfitFont.metric)
                    Text("Sin pesajes todavía")
                        .font(RupfitFont.caption)
                        .foregroundStyle(RupfitColor.textSecondary)
                }
                Spacer()
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.title2)
                    .foregroundStyle(RupfitColor.textTertiary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    nonisolated private func isToday(_ index: Int) -> Bool {
        let weekday = Calendar.current.component(.weekday, from: .now)
        let mondayBased = weekday == 1 ? 7 : weekday - 1
        return index + 1 == mondayBased
    }

    private func start(_ day: PlanDay) {
        Task {
            if let model = await container.beginSession(for: day) {
                active = model
            }
        }
    }
}
