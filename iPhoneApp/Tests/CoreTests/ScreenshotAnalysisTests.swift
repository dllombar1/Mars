import XCTest
@testable import Core

final class ScreenshotAnalysisTests: XCTestCase {

    // MARK: - ScreenshotAnalysis model

    func testFormattedDescription_noText() {
        let analysis = ScreenshotAnalysis(description: "Home screen detected.")
        XCTAssertEqual(analysis.formattedDescription, "Home screen detected.")
    }

    func testFormattedDescription_withText() {
        let analysis = ScreenshotAnalysis(
            description: "Settings screen.",
            detectedText: ["Wi-Fi", "Bluetooth"]
        )
        let result = analysis.formattedDescription
        XCTAssertTrue(result.contains("Settings screen."))
        XCTAssertTrue(result.contains("Wi-Fi"))
        XCTAssertTrue(result.contains("Bluetooth"))
    }

    // MARK: - ImageAnalysisService stub

    func testAnalyze_withTextData_detectsLines() async throws {
        let service = ImageAnalysisService()
        let input = "Hello World\nSettings\nWi-Fi"
        let data = Data(input.utf8)

        let analysis = try await service.analyze(imageData: data)
        XCTAssertFalse(analysis.description.isEmpty)
        XCTAssertGreaterThan(analysis.confidence, 0)

        #if !canImport(UIKit)
        // On Linux the stub splits on newlines
        XCTAssertEqual(analysis.detectedText.count, 3)
        XCTAssertTrue(analysis.detectedText.contains("Hello World"))
        #endif
    }

    func testAnalyze_emptyData_returnsAnalysis() async throws {
        let service = ImageAnalysisService()
        let analysis = try await service.analyze(imageData: Data())
        XCTAssertFalse(analysis.description.isEmpty)
    }

    // MARK: - ScreenshotService stub

    func testCapture_returnsData() async throws {
        let service = ScreenshotService()
        let data = try await service.capture()
        XCTAssertFalse(data.isEmpty)
    }
}
