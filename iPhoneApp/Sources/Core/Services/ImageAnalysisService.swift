import Foundation

public protocol ImageAnalysisServiceProtocol: Sendable {
    func analyze(imageData: Data) async throws -> ScreenshotAnalysis
}

// MARK: - Vision-based on-device implementation (iOS only)
// Compile the real Vision implementation only on Apple platforms.
#if canImport(Vision) && canImport(UIKit)
import Vision
import UIKit

public final class ImageAnalysisService: ImageAnalysisServiceProtocol, @unchecked Sendable {
    public init() {}

    public func analyze(imageData: Data) async throws -> ScreenshotAnalysis {
        guard let image = UIImage(data: imageData),
              let cgImage = image.cgImage else {
            throw AnalysisError.invalidImage
        }

        async let texts = recognizeText(in: cgImage)
        async let labels = classifyScene(in: cgImage)

        let (detectedText, sceneLabels) = try await (texts, labels)

        let description = buildDescription(sceneLabels: sceneLabels, texts: detectedText)
        return ScreenshotAnalysis(
            description: description,
            detectedText: detectedText,
            confidence: sceneLabels.first?.confidence.map(Double.init) ?? 1.0
        )
    }

    // MARK: - Text Recognition (OCR)

    private func recognizeText(in cgImage: CGImage) async throws -> [String] {
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { req, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let strings = (req.results as? [VNRecognizedTextObservation] ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
                continuation.resume(returning: strings)
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(cgImage: cgImage)
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    // MARK: - Scene Classification

    private func classifyScene(in cgImage: CGImage) async throws -> [VNClassificationObservation] {
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNClassifyImageRequest { req, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let results = (req.results as? [VNClassificationObservation] ?? [])
                    .filter { $0.confidence > 0.1 }
                    .sorted { $0.confidence > $1.confidence }
                continuation.resume(returning: Array(results.prefix(5)))
            }
            let handler = VNImageRequestHandler(cgImage: cgImage)
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    private func buildDescription(sceneLabels: [VNClassificationObservation], texts: [String]) -> String {
        var parts: [String] = []

        if !sceneLabels.isEmpty {
            let labels = sceneLabels.map { "\($0.identifier) (\(Int($0.confidence * 100))%)" }.joined(separator: ", ")
            parts.append("Scene: \(labels).")
        }

        if !texts.isEmpty {
            parts.append("The screen contains \(texts.count) text element(s).")
        } else {
            parts.append("No text detected on screen.")
        }

        return parts.joined(separator: " ")
    }
}

private enum AnalysisError: Error {
    case invalidImage
}

#else

// MARK: - Cross-platform stub for unit tests / Linux CI
public final class ImageAnalysisService: ImageAnalysisServiceProtocol, @unchecked Sendable {
    public init() {}

    public func analyze(imageData: Data) async throws -> ScreenshotAnalysis {
        // Minimal stub: parse any UTF-8 text embedded in the data
        let detectedText: [String]
        if let text = String(data: imageData, encoding: .utf8), !text.isEmpty {
            detectedText = text.components(separatedBy: "\n").filter { !$0.isEmpty }
        } else {
            detectedText = []
        }

        let description = detectedText.isEmpty
            ? "Screenshot captured. No recognizable text content (running outside iOS)."
            : "Screenshot captured. Detected \(detectedText.count) line(s) of text."

        return ScreenshotAnalysis(
            description: description,
            detectedText: detectedText,
            confidence: 0.9
        )
    }
}

#endif
