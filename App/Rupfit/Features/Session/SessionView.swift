import SwiftUI
import RupfitCore

@MainActor
struct SessionView: View {
    @Bindable var model: SessionModel
    @Environment(\.dismiss) private var dismiss

    @State private var showWeightSheet = false
    @State private var weightText = ""
    @State private var showSummary = false

    var body: some View {
        NavigationStack {
            VStack(spacing: Space.s) {
                PhaseBanner(week: week)
                exercisePager
                pager
                if let error = model.errorMessage {
                    ErrorBannerView(text: error)
                }
                actions
                restArea
            }
            .padding(.horizontal, Space.l)
            .padding(.top, Space.s)
            .padding(.bottom, Space.xs)
            .background(RupfitColor.background.ignoresSafeArea())
            .navigationTitle(model.session.dayNameSnapshot)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(RupfitColor.textSecondary)
                        .accessibilityIdentifier("closeSession")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Terminar") {
                        Task { await model.finish(partial: !model.allExercisesDone) }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(model.totalSets == 0 ? RupfitColor.textTertiary : RupfitColor.accentText)
                    .disabled(model.totalSets == 0)
                    .accessibilityIdentifier("finishSession")
                }
            }
        }
        .sheet(isPresented: $showWeightSheet) { weightSheet }
        .onChange(of: model.finished) { _, finished in
            if finished { showSummary = true }
        }
        .fullScreenCover(isPresented: $showSummary) {
            SessionSummaryView(model: model) {
                showSummary = false
                dismiss()
            }
        }
    }

    private var week: Int {
        if case .readaptation(let week) = model.session.phase { return week }
        return 1
    }

    private var exercisePager: some View {
        TabView(selection: $model.currentIndex) {
            ForEach(Array(model.session.exercises.enumerated()), id: \.element.id) { index, exercise in
                exerciseCard(exercise, index: index)
                    .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
    }

    private func exerciseCard(_ exercise: ExerciseSession, index: Int) -> some View {
        let meta = exercise.exerciseID.flatMap { model.exerciseMeta[$0] }
        return ScrollView {
            VStack(alignment: .leading, spacing: Space.s) {
                Text(exercise.exerciseNameSnapshot)
                    .font(RupfitFont.cardTitle)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: Space.xs) {
                    if let meta {
                        ChipView(text: meta.primaryMuscle.title, style: .solidAccent)
                        ChipView(text: meta.equipment.title, systemImage: "dumbbell", style: .neutral)
                    }
                }
                HStack(spacing: Space.xs) {
                    CompareTile(
                        label: "Última vez",
                        value: "—",
                        caption: "sin historial"
                    )
                    CompareTile(
                        label: "Peso de hoy",
                        value: todayWeight(exercise),
                        caption: "\(exercise.prescription.sets) × \(exercise.prescription.repRange.lowerBound)",
                        highlighted: true
                    )
                }
                .padding(.top, Space.xxs)

                Text(index == model.currentIndex ? model.reasonText : " ")
                    .font(RupfitFont.body)
                    .foregroundStyle(RupfitColor.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Divider().overlay(RupfitColor.border)

                VStack(spacing: 0) {
                    ForEach(rows(for: exercise, index: index), id: \.number) { row in
                        SetRowView(index: row.number,
                                   targetReps: exercise.prescription.repRange.lowerBound,
                                   state: row.state) { reps, effort, discomfort in
                            Task { await model.confirmSet(reps: reps, effort: effort, discomfort: discomfort) }
                        }
                        if row.number < exercise.prescription.sets {
                            Divider().overlay(RupfitColor.border)
                        }
                    }
                }
            }
            .padding(Space.l)
            .background(RupfitColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                    .stroke(RupfitColor.border, lineWidth: 1)
            )
        }
    }

    private func todayWeight(_ exercise: ExerciseSession) -> String {
        exercise.usedWeightKg.map(kg) ?? exercise.recommendation?.suggestedWeightKg.map(kg) ?? "—"
    }

    private struct SetRowDescriptor: Identifiable {
        let number: Int
        let state: SetRowState
        var id: Int { number }
    }

    /// Confirmed rows, one fresh active row, then pending. Building the active row as
    /// a new element (instead of changing an existing row's state) keeps its stepper
    /// state clean and makes the next "Confirmar" reachable by UI tests.
    private func rows(for exercise: ExerciseSession, index: Int) -> [SetRowDescriptor] {
        var rows: [SetRowDescriptor] = exercise.sets.map {
            SetRowDescriptor(number: $0.index, state: .done($0))
        }
        let isCurrent = index == model.currentIndex
        if isCurrent, exercise.decision != nil, exercise.sets.count < exercise.prescription.sets {
            rows.append(SetRowDescriptor(number: exercise.sets.count + 1, state: .active))
        }
        let next = exercise.sets.count + (rows.count > exercise.sets.count ? 2 : 1)
        if next <= exercise.prescription.sets {
            for number in next...exercise.prescription.sets {
                rows.append(SetRowDescriptor(number: number, state: .pending))
            }
        }
        return rows
    }

    private var pager: some View {
        HStack(spacing: Space.s) {
            Button {
                model.currentIndex = max(0, model.currentIndex - 1)
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .disabled(model.currentIndex == 0)
            .foregroundStyle(RupfitColor.textSecondary)

            ProgressView(
                value: Double(model.currentIndex + 1),
                total: Double(model.session.exercises.count)
            )
            .tint(RupfitColor.accent)

            Text("\(model.currentIndex + 1) / \(model.session.exercises.count)")
                .font(RupfitFont.caption.monospacedDigit())
                .accessibilityIdentifier("sessionPager")
                .foregroundStyle(RupfitColor.textSecondary)
                .accessibilityLabel("Ejercicio \(model.currentIndex + 1) de \(model.session.exercises.count)")

            Button {
                model.currentIndex = min(model.session.exercises.count - 1, model.currentIndex + 1)
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .disabled(model.currentIndex == model.session.exercises.count - 1)
            .foregroundStyle(RupfitColor.textSecondary)
        }
    }

    @ViewBuilder
    private var actions: some View {
        if model.hasDecision {
            HStack(spacing: Space.s) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("PESO DE HOY")
                        .font(RupfitFont.label)
                        .foregroundStyle(RupfitColor.textSecondary)
                    Text(model.usedWeightKg.map(kg) ?? "—")
                        .font(.title3.weight(.semibold))
                        .monospacedDigit()
                }
                Spacer()
                Button { Task { await model.adjustWeight(by: -model.incrementKg) } } label: {
                    Image(systemName: "minus").frame(width: 44, height: 44)
                }
                .background(RupfitColor.raised)
                .clipShape(Circle())
                .accessibilityLabel("Bajar el peso")
                Button { Task { await model.adjustWeight(by: model.incrementKg) } } label: {
                    Image(systemName: "plus").frame(width: 44, height: 44)
                }
                .background(RupfitColor.raised)
                .clipShape(Circle())
                .accessibilityLabel("Subir el peso")
                Button("Cambiar") {
                    weightText = model.usedWeightKg.map { String(format: "%.1f", $0) } ?? ""
                    showWeightSheet = true
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(RupfitColor.accentText)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Peso de hoy, \(model.usedWeightKg.map(kg) ?? "sin elegir")")
        } else {
            LoadDecisionBar(
                suggested: model.suggestedWeightKg,
                previous: nil,
                onAccept: { Task { await model.accept() } },
                onRepeat: {},
                onOther: {
                    weightText = ""
                    showWeightSheet = true
                }
            )
        }
    }

    private var restArea: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            if let remaining = model.remainingRest(at: context.date), remaining > 0 {
                RestBarView(remaining: remaining, onAdd: { model.addRest() }, onSkip: { model.skipRest() })
            }
        }
    }

    private var weightSheet: some View {
        NavigationStack {
            Form {
                TextField("Peso en kg", text: $weightText)
                    .keyboardType(.decimalPad)
                    .font(.title2.monospacedDigit())
                    .accessibilityIdentifier("weightField")
            }
            .navigationTitle("Elegir peso")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showWeightSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        let normalized = weightText.replacingOccurrences(of: ",", with: ".")
                        if let value = Double(normalized), value > 0 {
                            Task { await model.setManualWeight(value) }
                        }
                        showWeightSheet = false
                    }
                    .disabled(Double(weightText.replacingOccurrences(of: ",", with: ".")) == nil)
                    .accessibilityIdentifier("saveWeight")
                }
            }
        }
        .presentationDetents([.height(220)])
    }

    nonisolated private func kg(_ value: Double) -> String {
        String(format: "%.1f", value).replacingOccurrences(of: ".", with: ",") + " kg"
    }
}

private extension MuscleGroup {
    var title: String {
        switch self {
        case .quadriceps: "Cuádriceps"
        case .hamstrings: "Isquios"
        case .glutes: "Glúteos"
        case .calves: "Gemelos"
        case .lowerBack: "Lumbar"
        case .chest: "Pecho"
        case .shoulders: "Hombros"
        case .triceps: "Tríceps"
        case .lats: "Dorsal"
        case .upperBack: "Espalda alta"
        case .biceps: "Bíceps"
        case .forearms: "Antebrazo"
        case .core: "Core"
        }
    }
}

private extension Equipment {
    var title: String {
        switch self {
        case .barbell: "Barra"
        case .dumbbell: "Mancuernas"
        case .machine: "Máquina"
        case .cable: "Polea"
        case .bodyweight: "Peso corporal"
        case .band: "Goma"
        }
    }
}
