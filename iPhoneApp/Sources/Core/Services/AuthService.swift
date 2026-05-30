import Foundation

public enum AuthError: Error, LocalizedError, Equatable {
    case invalidCredentials
    case networkError(String)
    case userNotFound
    case weakPassword
    case emailAlreadyInUse

    public var errorDescription: String? {
        switch self {
        case .invalidCredentials:   return "Invalid email or password."
        case .networkError(let m):  return "Network error: \(m)"
        case .userNotFound:         return "No account found with that email."
        case .weakPassword:         return "Password must be at least 8 characters."
        case .emailAlreadyInUse:    return "An account with this email already exists."
        }
    }
}

public protocol AuthServiceProtocol: Sendable {
    func signIn(email: String, password: String) async throws -> User
    func signUp(email: String, password: String, displayName: String) async throws -> User
    func signOut() async throws
    var currentUser: User? { get }
}

public final class AuthService: AuthServiceProtocol, @unchecked Sendable {
    public static let shared = AuthService()

    private var _currentUser: User?
    private let lock = NSLock()

    public var currentUser: User? {
        lock.lock()
        defer { lock.unlock() }
        return _currentUser
    }

    // Persisted session key
    private let sessionKey = "screensight.session.user"

    public init() {
        loadPersistedSession()
    }

    public func signIn(email: String, password: String) async throws -> User {
        guard isValidEmail(email) else { throw AuthError.invalidCredentials }
        guard password.count >= 8 else { throw AuthError.invalidCredentials }

        // Simulate network latency
        try await Task.sleep(nanoseconds: 500_000_000)

        // Demo: accept any well-formed credentials
        let user = User(id: UUID().uuidString, email: email, displayName: nameFromEmail(email))
        persist(user: user)
        return user
    }

    public func signUp(email: String, password: String, displayName: String) async throws -> User {
        guard isValidEmail(email) else { throw AuthError.invalidCredentials }
        guard password.count >= 8 else { throw AuthError.weakPassword }
        guard !displayName.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw AuthError.invalidCredentials
        }

        try await Task.sleep(nanoseconds: 700_000_000)

        let user = User(id: UUID().uuidString, email: email, displayName: displayName)
        persist(user: user)
        return user
    }

    public func signOut() async throws {
        lock.lock()
        _currentUser = nil
        lock.unlock()
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }

    // MARK: - Private helpers

    private func isValidEmail(_ email: String) -> Bool {
        let regex = #"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"#
        return email.range(of: regex, options: .regularExpression) != nil
    }

    private func nameFromEmail(_ email: String) -> String {
        email.components(separatedBy: "@").first?.capitalized ?? email
    }

    private func persist(user: User) {
        lock.lock()
        _currentUser = user
        lock.unlock()
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: sessionKey)
        }
    }

    private func loadPersistedSession() {
        guard let data = UserDefaults.standard.data(forKey: sessionKey),
              let user = try? JSONDecoder().decode(User.self, from: data) else { return }
        lock.lock()
        _currentUser = user
        lock.unlock()
    }
}
