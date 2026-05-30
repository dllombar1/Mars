import Foundation

public struct ScreenshotAnalysis: Identifiable, Equatable, Sendable {
    public let id: String
    public let timestamp: Date
    public let description: String
    public let detectedText: [String]
    public let confidence: Double

    public init(
        id: String = UUID().uuidString,
        timestamp: Date = Date(),
        description: String,
        detectedText: [String] = [],
        confidence: Double = 1.0
    ) {
        self.id = id
        self.timestamp = timestamp
        self.description = description
        self.detectedText = detectedText
        self.confidence = confidence
    }

    public var formattedDescription: String {
        var parts: [String] = [description]
        if !detectedText.isEmpty {
            parts.append("Text found: \(detectedText.joined(separator: ", "))")
        }
        return parts.joined(separator: "\n\n")
    }
}
