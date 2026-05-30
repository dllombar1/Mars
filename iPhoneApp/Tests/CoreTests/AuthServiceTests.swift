import XCTest
@testable import Core

final class AuthServiceTests: XCTestCase {

    var sut: AuthService!

    override func setUp() {
        super.setUp()
        sut = AuthService()
    }

    // MARK: - Sign In

    func testSignIn_validCredentials_returnsUser() async throws {
        let user = try await sut.signIn(email: "alice@example.com", password: "securePass1")
        XCTAssertEqual(user.email, "alice@example.com")
        XCTAssertFalse(user.id.isEmpty)
    }

    func testSignIn_badEmail_throws() async {
        do {
            _ = try await sut.signIn(email: "not-an-email", password: "securePass1")
            XCTFail("Expected throw")
        } catch AuthError.invalidCredentials {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    func testSignIn_shortPassword_throws() async {
        do {
            _ = try await sut.signIn(email: "alice@example.com", password: "short")
            XCTFail("Expected throw")
        } catch AuthError.invalidCredentials {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    // MARK: - Sign Up

    func testSignUp_validData_returnsUser() async throws {
        let user = try await sut.signUp(
            email: "bob@example.com",
            password: "strongPass99",
            displayName: "Bob"
        )
        XCTAssertEqual(user.email, "bob@example.com")
        XCTAssertEqual(user.displayName, "Bob")
    }

    func testSignUp_weakPassword_throws() async {
        do {
            _ = try await sut.signUp(email: "bob@example.com", password: "123", displayName: "Bob")
            XCTFail("Expected throw")
        } catch AuthError.weakPassword {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    func testSignUp_emptyDisplayName_throws() async {
        do {
            _ = try await sut.signUp(email: "bob@example.com", password: "strongPass99", displayName: "   ")
            XCTFail("Expected throw")
        } catch AuthError.invalidCredentials {
            // expected
        } catch {
            XCTFail("Wrong error: \(error)")
        }
    }

    // MARK: - Sign Out

    func testSignOut_clearsCurrentUser() async throws {
        _ = try await sut.signIn(email: "alice@example.com", password: "securePass1")
        XCTAssertNotNil(sut.currentUser)
        try await sut.signOut()
        XCTAssertNil(sut.currentUser)
    }
}
