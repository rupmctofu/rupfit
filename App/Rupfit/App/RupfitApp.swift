import SwiftUI

@main
struct RupfitApp: App {
    @State private var container: AppContainer?
    @State private var bootError: String?

    var body: some Scene {
        WindowGroup {
            Group {
                if let container {
                    RootView(container: container)
                } else if let bootError {
                    VStack(spacing: Space.m) {
                        EmptyStateView(text: bootError)
                        Text("Reinicia la app. Si vuelve a pasar, exporta los datos desde el Mac.")
                            .font(RupfitFont.caption)
                            .foregroundStyle(RupfitColor.textSecondary)
                    }
                    .padding(Space.l)
                    .background(RupfitColor.background)
                } else {
                    ProgressView()
                        .task {
                            do {
                                container = try AppContainer()
                            } catch {
                                bootError = "No se pudo abrir la base de datos local."
                            }
                        }
                }
            }
            .environment(\.locale, Locale(identifier: "es_ES"))
            .preferredColorScheme(.dark)
        }
    }
}
