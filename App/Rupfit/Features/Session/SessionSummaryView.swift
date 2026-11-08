import SwiftUI
import RupfitCore

@MainActor
struct SessionSummaryView: View {
    let model: SessionModel
    let onDone: () -> Void

    private var sets: [SetRecord] {
        model.session.exercises.flatMap(\.sets)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.m) {
                Text(model.session.status == .partial ? "Sesión parcial" : "Sesión completada")
                    .font(RupfitFont.screenTitle)
                    .accessibilityIdentifier("sessionSummaryTitle")
                Text(model.session.dayNameSnapshot)
                    .font(RupfitFont.meta)
                    .foregroundStyle(RupfitColor.textSecondary)

                SurfaceCard {
                    HStack(alignment: .top, spacing: Space.s) {
                        metric("Series", "\(sets.count)")
                            .accessibilityIdentifier("summarySets")
                        metric("Duración", "\(Int(model.duration(at: .now) / 60)) min")
                        metric("Volumen", "\(Int(model.volume())) kg")
                    }
                }

                SurfaceCard {
                    VStack(alignment: .leading, spacing: Space.s) {
                        Text("Ejercicios")
                            .font(RupfitFont.label)
                            .foregroundStyle(RupfitColor.textSecondary)
                        ForEach(model.session.exercises) { exercise in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(exercise.exerciseNameSnapshot)
                                        .font(.body.weight(.medium))
                                    Text("\(exercise.sets.count) de \(exercise.prescription.sets) series")
                                        .font(RupfitFont.caption)
                                        .foregroundStyle(RupfitColor.textSecondary)
                                }
                                Spacer()
                                Text("\(Int(Statistics.sessionVolume(exercise.sets))) kg")
                                    .font(.subheadline.monospacedDigit())
                                    .foregroundStyle(RupfitColor.textSecondary)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }

                PrimaryButton(title: "Hecho") { onDone() }
            }
            .padding(Space.l)
        }
        .background(RupfitColor.background.ignoresSafeArea())
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(RupfitFont.label)
                .foregroundStyle(RupfitColor.textSecondary)
            Text(value)
                .font(RupfitFont.metric)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
