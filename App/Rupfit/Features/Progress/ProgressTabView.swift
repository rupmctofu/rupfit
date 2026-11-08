import SwiftUI

struct ProgressTabView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.m) {
                    Text("Progreso")
                        .font(RupfitFont.screenTitle)
                    EmptyStateView(
                        text: """
                        Sin datos todavía. Registra una sesión y aquí aparecerán la fuerza \
                        por ejercicio, los récords y el volumen semanal.
                        """
                    )
                    SurfaceCard(padding: Space.m) {
                        HStack {
                            Text("Peso corporal")
                                .font(RupfitFont.meta)
                            Spacer()
                            ChipView(text: "sin datos")
                        }
                    }
                }
                .padding(Space.l)
            }
            .background(RupfitColor.background)
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
