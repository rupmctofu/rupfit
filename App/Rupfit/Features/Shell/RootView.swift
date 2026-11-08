import SwiftUI

struct RootView: View {
    let container: AppContainer

    var body: some View {
        TabView {
            HomeView(container: container)
                .tabItem { Label("Inicio", systemImage: "house.fill") }
            TrainView(container: container)
                .tabItem { Label("Entrenar", systemImage: "dumbbell.fill") }
            ProgressTabView()
                .tabItem { Label("Progreso", systemImage: "chart.bar.fill") }
            ProfileView()
                .tabItem { Label("Perfil", systemImage: "person.fill") }
        }
        .tint(RupfitColor.accent)
    }
}
