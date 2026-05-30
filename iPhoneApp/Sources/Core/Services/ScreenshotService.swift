import Foundation

public enum ScreenshotError: Error, LocalizedError {
    case captureFailed
    case permissionDenied
    case notSupported

    public var errorDescription: String? {
        switch self {
        case .captureFailed:    return "Failed to capture screenshot."
        case .permissionDenied: return "Screen recording permission was denied."
        case .notSupported:     return "Screenshot capture is not supported on this device."
        }
    }
}

public protocol ScreenshotServiceProtocol: Sendable {
    func capture() async throws -> Data
}

#if canImport(UIKit)
import UIKit

public final class ScreenshotService: ScreenshotServiceProtocol, @unchecked Sendable {
    public init() {}

    /// Captures the current key window as a PNG image.
    public func capture() async throws -> Data {
        return try await MainActor.run {
            guard let window = UIApplication.shared
                .connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first?
                .windows
                .first(where: { $0.isKeyWindow }) else {
                throw ScreenshotError.captureFailed
            }

            let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
            let image = renderer.image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }

            guard let data = image.pngData() else {
                throw ScreenshotError.captureFailed
            }
            return data
        }
    }
}

#else

// Cross-platform stub
public final class ScreenshotService: ScreenshotServiceProtocol, @unchecked Sendable {
    public init() {}

    public func capture() async throws -> Data {
        // Return synthetic data for testing
        let sample = "Stub screenshot: \(Date().description)"
        return Data(sample.utf8)
    }
}

#endif
