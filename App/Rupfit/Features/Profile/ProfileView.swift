import SwiftUI

struct ProfileView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.m) {
                    Text("Perfil")
                        .font(RupfitFont.screenTitle)
                    SurfaceCard(padding: Space.s) {
                        VStack(spacing: 0) {
                            row("Rup", "Plan de 3 días · gimnasio")
                            Divider().overlay(RupfitColor.border)
                            row("Objetivos", "Mantener peso · fuerza general")
                            Divider().overlay(RupfitColor.border)
                            row("Unidades", "Kilogramos")
                        }
                    }
                    Text("DATOS")
                        .font(RupfitFont.label)
                        .foregroundStyle(RupfitColor.textSecondary)
                    SurfaceCard(padding: Space.s) {
                        VStack(spacing: 0) {
                            row("Apple Health", "Solo lectura · 4 tipos", icon: "heart")
                            Divider().overlay(RupfitColor.border)
                            row("Apple Watch", "Contrato listo · app en P1", icon: "applewatch")
                            Divider().overlay(RupfitColor.border)
                            row("Exportar datos", "JSON completo", icon: "square.and.arrow.up")
                        }
                    }
                }
                .padding(Space.l)
            }
            .background(RupfitColor.background)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func row(_ title: String, _ subtitle: String, icon: String? = nil) -> some View {
        HStack(spacing: Space.s) {
            if let icon {
                Image(systemName: icon)
                    .frame(width: 34, height: 34)
                    .background(RupfitColor.raised)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                    .foregroundStyle(RupfitColor.textSecondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.medium))
                Text(subtitle)
                    .font(RupfitFont.caption)
                    .foregroundStyle(RupfitColor.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(RupfitColor.textTertiary)
        }
        .padding(.vertical, Space.xs)
        .accessibilityElement(children: .combine)
    }
}
