import SwiftUI
import RupfitCore

struct SurfaceCard<Content: View>: View {
    var padding: CGFloat = Space.l
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RupfitColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                    .stroke(RupfitColor.border, lineWidth: 1)
            )
    }
}

struct PrimaryButton: View {
    let title: String
    var systemImage: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.xs) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title).font(.headline)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(RupfitColor.onAccent)
            .background(RupfitColor.accent)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
    }
}

struct SecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 56)
                .foregroundStyle(RupfitColor.textPrimary)
                .background(RupfitColor.raised)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

enum ChipStyle {
    case neutral, accent, solidAccent, success, warning, danger
}

struct ChipView: View {
    let text: String
    var systemImage: String?
    var style: ChipStyle = .neutral

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage).font(.caption2) }
            if style == .success || style == .warning || style == .danger {
                Circle().fill(foreground).frame(width: 6, height: 6)
            }
            Text(text).font(.caption.weight(.medium))
        }
        .padding(.horizontal, Space.xs)
        .padding(.vertical, 4)
        .foregroundStyle(foreground)
        .background(background)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(border, lineWidth: 1))
    }

    private var foreground: Color {
        switch style {
        case .neutral: RupfitColor.textSecondary
        case .accent: RupfitColor.accentText
        case .solidAccent: RupfitColor.onAccent
        case .success: RupfitColor.success
        case .warning: RupfitColor.warning
        case .danger: RupfitColor.danger
        }
    }

    private var background: Color {
        switch style {
        case .solidAccent: RupfitColor.accent
        case .accent: RupfitColor.accentMuted
        default: RupfitColor.raised
        }
    }

    private var border: Color {
        switch style {
        case .solidAccent, .accent, .success, .warning, .danger: .clear
        default: RupfitColor.border
        }
    }
}

struct CompareTile: View {
    let label: String
    let value: String
    let caption: String
    var highlighted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(RupfitFont.label)
                .foregroundStyle(highlighted ? RupfitColor.accentText : RupfitColor.textSecondary)
            Text(value)
                .font(RupfitFont.metric)
                .foregroundStyle(highlighted ? RupfitColor.accentText : RupfitColor.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(caption).font(RupfitFont.caption).foregroundStyle(RupfitColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s)
        .background(highlighted ? RupfitColor.accentMuted : RupfitColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .stroke(highlighted ? RupfitColor.accent : RupfitColor.border, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value), \(caption)")
    }
}

struct PhaseBanner: View {
    let week: Int

    var body: some View {
        HStack {
            Label("Readaptación · semana \(week) de 4", systemImage: "calendar")
                .font(.footnote.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote)
                .foregroundStyle(RupfitColor.textTertiary)
        }
        .padding(.horizontal, Space.m)
        .padding(.vertical, Space.s)
        .background(RupfitColor.raised)
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

enum SetRowState {
    case pending, active, done(SetRecord)
}

struct SetRowView: View {
    let index: Int
    let targetReps: Int
    let state: SetRowState
    let onConfirm: (Int, Effort?, Discomfort?) -> Void

    @State private var reps: Int
    @State private var effort: Effort?
    @State private var discomfort: Discomfort?

    init(index: Int, targetReps: Int, state: SetRowState,
         onConfirm: @escaping (Int, Effort?, Discomfort?) -> Void) {
        self.index = index
        self.targetReps = targetReps
        self.state = state
        self.onConfirm = onConfirm
        _reps = State(initialValue: targetReps)
    }

    var body: some View {
        switch state {
        case .done(let record):
            HStack(spacing: Space.s) {
                Text("Serie \(index)")
                    .font(RupfitFont.label)
                    .foregroundStyle(RupfitColor.textSecondary)
                    .frame(width: 64, alignment: .leading)
                Text("\(record.actualReps) / \(targetReps)")
                    .font(.body.monospacedDigit())
                Spacer()
                if let effort = record.effort {
                    ChipView(text: label(for: effort), style: .success)
                }
                if record.discomfort == .mild || record.discomfort == .pain {
                    ChipView(text: record.discomfort == .pain ? "dolor" : "molestia", style: .danger)
                }
                Image(systemName: "checkmark")
                    .foregroundStyle(RupfitColor.success)
            }
            .padding(.vertical, Space.xs)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Serie \(index), completada, \(record.actualReps) de \(targetReps) repeticiones")

        case .pending:
            HStack(spacing: Space.s) {
                Text("Serie \(index)")
                    .font(RupfitFont.label)
                    .foregroundStyle(RupfitColor.textSecondary)
                    .frame(width: 64, alignment: .leading)
                Text("\(targetReps) reps").font(.body)
                Spacer()
                Image(systemName: "circle")
                    .foregroundStyle(RupfitColor.textTertiary)
            }
            .padding(.vertical, Space.xs)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Serie \(index), pendiente, \(targetReps) repeticiones")

        case .active:
            VStack(alignment: .leading, spacing: Space.s) {
                HStack {
                    Text("Serie \(index)")
                        .font(RupfitFont.label)
                        .foregroundStyle(RupfitColor.textSecondary)
                    Spacer()
                    Stepper(value: $reps, in: 0...30) {
                        Text("\(reps) reps").font(.title3.weight(.semibold).monospacedDigit())
                    }
                    .labelsHidden()
                    Text("\(reps) reps").font(.title3.weight(.semibold).monospacedDigit())
                }
                HStack(spacing: Space.xs) {
                    ForEach(Effort.allCases, id: \.self) { value in
                        Button {
                            effort = (effort == value) ? nil : value
                        } label: {
                            ChipView(text: label(for: value), style: effort == value ? .accent : .neutral)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    Button {
                        discomfort = discomfort == .mild ? nil : .mild
                    } label: {
                        ChipView(text: "molestia", style: discomfort == .mild ? .danger : .neutral)
                    }
                    .buttonStyle(.plain)
                }
                PrimaryButton(title: "Confirmar", systemImage: nil) {
                    onConfirm(reps, effort, discomfort)
                }
                .accessibilityLabel("Confirmar serie \(index)")
                .accessibilityIdentifier("confirmSet-\(index)")
            }
            .padding(.vertical, Space.xs)
        }
    }

    private func label(for effort: Effort) -> String {
        switch effort {
        case .easy: "fácil"
        case .correct: "correcto"
        case .hard: "duro"
        case .failure: "fallo"
        }
    }
}

struct LoadDecisionBar: View {
    let suggested: Double?
    let previous: Double?
    let onAccept: () -> Void
    let onRepeat: () -> Void
    let onOther: () -> Void

    var body: some View {
        HStack(spacing: Space.xs) {
            if let suggested {
                Button(action: onAccept) {
                    Text("Aceptar \(format(suggested)) kg")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .foregroundStyle(RupfitColor.onAccent)
                        .background(RupfitColor.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            if let previous {
                SecondaryButton(title: "Repetir \(format(previous))", action: onRepeat)
            }
            Button(action: onOther) {
                Text(suggested == nil ? "Elegir peso" : "Otro peso")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .foregroundStyle(suggested == nil ? RupfitColor.onAccent : RupfitColor.textPrimary)
                    .background(suggested == nil ? RupfitColor.accent : RupfitColor.raised)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Decisión de peso")
        .accessibilityIdentifier("loadDecisionBar")
    }

    private func format(_ kg: Double) -> String {
        let value = String(format: "%.1f", kg)
        return value.replacingOccurrences(of: ".", with: ",")
    }
}

struct RestBarView: View {
    let remaining: TimeInterval
    let onAdd: () -> Void
    let onSkip: () -> Void

    var body: some View {
        HStack(spacing: Space.s) {
            VStack(alignment: .leading, spacing: 0) {
                Label("Descanso", systemImage: "clock")
                    .font(RupfitFont.label)
                    .foregroundStyle(RupfitColor.textSecondary)
                Text(time)
                    .font(.title2.weight(.semibold).monospacedDigit())
            }
            Spacer()
            Button("+15 s", action: onAdd)
                .buttonStyle(.bordered)
            Button("Saltar", action: onSkip)
                .buttonStyle(.borderedProminent)
                .tint(RupfitColor.raised)
                .foregroundStyle(RupfitColor.textPrimary)
        }
        .padding(Space.m)
        .background(RupfitColor.raised)
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Descanso, quedan \(Int(remaining.rounded())) segundos")
    }

    private var time: String {
        let total = max(0, Int(remaining.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

struct EmptyStateView: View {
    let text: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s) {
            Text(text)
                .font(RupfitFont.body)
                .foregroundStyle(RupfitColor.textSecondary)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RupfitColor.accentText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.m)
        .overlay(
            RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .strokeBorder(RupfitColor.border, style: StrokeStyle(lineWidth: 1, dash: [4]))
        )
    }
}

struct ErrorBannerView: View {
    let text: String
    var retry: (() -> Void)?

    var body: some View {
        HStack {
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundStyle(RupfitColor.danger)
            Spacer()
            if let retry {
                Button("Reintentar", action: retry)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(RupfitColor.danger)
            }
        }
        .padding(Space.s)
        .background(RupfitColor.raised)
        .clipShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    }
}
