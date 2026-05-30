import SwiftUI
import Core

struct LoginView: View {
    @EnvironmentObject var appState: AppState

    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var isSignUp = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    private let auth = AuthService.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    header
                    fields
                    actionButton
                    toggleModeButton
                }
                .padding(.horizontal, 32)
                .padding(.top, 40)
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarHidden(true)
        }
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "viewfinder.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.blue)

            Text("ScreenSight")
                .font(.largeTitle.bold())

            Text(isSignUp ? "Create your account" : "Sign in to continue")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var fields: some View {
        VStack(spacing: 16) {
            if isSignUp {
                FloatingLabelField(label: "Display Name", text: $displayName, icon: "person")
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            FloatingLabelField(label: "Email", text: $email, icon: "envelope",
                               keyboardType: .emailAddress, contentType: .emailAddress)

            FloatingLabelField(label: "Password", text: $password, icon: "lock",
                               isSecure: true, contentType: isSignUp ? .newPassword : .password)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }
        }
        .animation(.spring(duration: 0.3), value: isSignUp)
    }

    private var actionButton: some View {
        Button {
            Task { await submit() }
        } label: {
            Group {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(isSignUp ? "Create Account" : "Sign In")
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(canSubmit ? Color.blue : Color.gray.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!canSubmit || isLoading)
    }

    private var toggleModeButton: some View {
        Button {
            withAnimation { isSignUp.toggle(); errorMessage = nil }
        } label: {
            HStack(spacing: 4) {
                Text(isSignUp ? "Already have an account?" : "Don't have an account?")
                    .foregroundStyle(.secondary)
                Text(isSignUp ? "Sign In" : "Sign Up")
                    .fontWeight(.semibold)
                    .foregroundStyle(.blue)
            }
            .font(.subheadline)
        }
    }

    // MARK: - Logic

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && (!isSignUp || !displayName.isEmpty)
    }

    private func submit() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let user: User
            if isSignUp {
                user = try await auth.signUp(email: email, password: password, displayName: displayName)
            } else {
                user = try await auth.signIn(email: email, password: password)
            }
            appState.currentUser = user
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Reusable input field

private struct FloatingLabelField: View {
    let label: String
    @Binding var text: String
    var icon: String
    var keyboardType: UIKeyboardType = .default
    var contentType: UITextContentType? = nil
    var isSecure = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.secondary)
                .frame(width: 20)

            Group {
                if isSecure {
                    SecureField(label, text: $text)
                } else {
                    TextField(label, text: $text)
                        .keyboardType(keyboardType)
                        .textContentType(contentType)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 54)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
