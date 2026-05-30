import SwiftUI
import Core

struct MainView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var vm = ScreenshotViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if vm.analyses.isEmpty {
                    emptyState
                } else {
                    analysisList
                }
            }
            .navigationTitle("ScreenSight")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    userMenu
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    captureButton
                }
            }
            .overlay(alignment: .bottom) {
                if vm.isCapturing {
                    capturingIndicator
                }
            }
        }
    }

    // MARK: - Subviews

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Screenshots Yet", systemImage: "camera.viewfinder")
        } description: {
            Text("Tap the camera button to capture and analyze your screen.")
        } actions: {
            Button("Capture Now") {
                Task { await vm.captureAndAnalyze() }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var analysisList: some View {
        List {
            ForEach(vm.analyses) { analysis in
                NavigationLink(destination: AnalysisDetailView(analysis: analysis)) {
                    AnalysisRowView(analysis: analysis)
                }
            }
            .onDelete { indexSet in
                vm.analyses.remove(atOffsets: indexSet)
            }
        }
        .listStyle(.insetGrouped)
    }

    private var captureButton: some View {
        Button {
            Task { await vm.captureAndAnalyze() }
        } label: {
            Image(systemName: "camera.viewfinder")
                .font(.title2)
        }
        .disabled(vm.isCapturing)
    }

    private var userMenu: some View {
        Menu {
            if let user = appState.currentUser {
                Text(user.displayName).font(.headline)
                Text(user.email).font(.caption).foregroundStyle(.secondary)
                Divider()
            }
            Button(role: .destructive) {
                Task { await appState.signOut() }
            } label: {
                Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
            }
        } label: {
            Image(systemName: "person.circle")
                .font(.title2)
        }
    }

    private var capturingIndicator: some View {
        HStack(spacing: 10) {
            ProgressView()
            Text("Analyzing…")
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .padding(.bottom, 24)
    }
}

// MARK: - Analysis Row

private struct AnalysisRowView: View {
    let analysis: ScreenshotAnalysis

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(analysis.description)
                .font(.subheadline)
                .lineLimit(2)

            HStack {
                Text(analysis.timestamp, style: .relative)
                Spacer()
                if !analysis.detectedText.isEmpty {
                    Label("\(analysis.detectedText.count) text items", systemImage: "text.viewfinder")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
