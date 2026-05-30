import SwiftUI
import Core

@MainActor
final class ScreenshotViewModel: ObservableObject {
    @Published var analyses: [ScreenshotAnalysis] = []
    @Published var isCapturing = false
    @Published var errorMessage: String?

    private let screenshotService: ScreenshotServiceProtocol
    private let analysisService: ImageAnalysisServiceProtocol

    init(
        screenshotService: ScreenshotServiceProtocol = ScreenshotService(),
        analysisService: ImageAnalysisServiceProtocol = ImageAnalysisService()
    ) {
        self.screenshotService = screenshotService
        self.analysisService = analysisService
    }

    func captureAndAnalyze() async {
        isCapturing = true
        errorMessage = nil
        defer { isCapturing = false }

        do {
            let imageData = try await screenshotService.capture()
            let analysis = try await analysisService.analyze(imageData: imageData)
            analyses.insert(analysis, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
