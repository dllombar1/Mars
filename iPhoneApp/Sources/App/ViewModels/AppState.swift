import SwiftUI
import Core

@MainActor
final class AppState: ObservableObject {
    @Published var currentUser: User?
    @Published var isLoading = false

    private let auth = AuthService.shared

    init() {
        currentUser = auth.currentUser
    }

    func signOut() async {
        isLoading = true
        defer { isLoading = false }
        try? await auth.signOut()
        currentUser = nil
    }
}
