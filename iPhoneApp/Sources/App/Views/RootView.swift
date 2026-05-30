import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        if appState.currentUser != nil {
            MainView()
        } else {
            LoginView()
        }
    }
}
