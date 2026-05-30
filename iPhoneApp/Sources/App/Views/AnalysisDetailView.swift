import SwiftUI
import Core

struct AnalysisDetailView: View {
    let analysis: ScreenshotAnalysis

    var body: some View {
        List {
            Section("Description") {
                Text(analysis.description)
                    .font(.body)
            }

            if !analysis.detectedText.isEmpty {
                Section("Detected Text (\(analysis.detectedText.count))") {
                    ForEach(analysis.detectedText, id: \.self) { line in
                        Label(line, systemImage: "text.alignleft")
                            .font(.subheadline)
                    }
                }
            }

            Section("Metadata") {
                LabeledContent("Captured", value: analysis.timestamp.formatted(date: .long, time: .shortened))
                LabeledContent("Confidence", value: analysis.confidence.formatted(.percent.precision(.fractionLength(0))))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Analysis")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                ShareLink(item: analysis.formattedDescription)
            }
        }
    }
}
