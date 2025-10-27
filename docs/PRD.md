🧾 Product Requirements Document (PRD)
Project: ClipForge – Desktop Video Editor (MVP)

Duration: 72 Hours (Oct 27–29)
Tech Stack: Tauri (Rust + React + Material UI), Native FFmpeg
Auth: None

1. Background & Problem Statement

Creators need fast, intuitive desktop video editing tools that don’t sacrifice performance. Existing options are either overly complex (Premiere, DaVinci) or lightweight but browser-based.

ClipForge aims to deliver a native desktop video editor — built in just 72 hours — that can record, import, trim, preview, and export videos. The result will be a minimal, high-performance application that feels as smooth as CapCut but runs locally, powered by Tauri and native FFmpeg.

2. Goals

Build a native cross-platform desktop app using Tauri + React + MUI.

Integrate FFmpeg natively for recording, trimming, and exporting.

Support screen and camera capture directly via FFmpeg commands.

Provide a clean, intuitive CapCut-style interface using Material UI.

Package the app as a native .app / .exe binary.

3. Non-Goals

No authentication, effects, or transitions.

No multi-track editing.

No export configuration (fixed MP4 @ 1080p/30fps).

No advanced audio handling.

4. Core MVP Features
Feature	Description	Implementation Notes
App Launch	Native desktop app built with Tauri.	Single main window, dark theme via MUI ThemeProvider.
Video Import	Drag-and-drop or file picker for MP4/MOV.	Display video metadata and load into timeline.
Timeline View	Horizontal single-clip timeline with trim handles.	Use MUI Slider to represent trim range.
Preview Player	Play/pause imported video in <video> tag.	Reflect trim range visually.
Trim & Export	Select in/out points, export trimmed segment via FFmpeg.	Rust command executes FFmpeg with -ss and -to.
Native Screen Recording	Record full desktop using FFmpeg.	macOS: -f avfoundation -i "1"; Windows: -f gdigrab -i desktop.
Native Camera Recording	Capture webcam video.	macOS: -f avfoundation -i "0"; Windows: -f dshow -i video="Camera".
Permissions Handling	OS prompts for recording permissions once.	Run FFmpeg manually the first time to grant OS-level approval.
5. Architecture Overview
Frontend (React + MUI)

Key Components:

App.tsx — Root layout, theme setup.

EditorLayout.tsx — Main editing interface (AppBar, Player, Timeline).

VideoPlayer.tsx — Playback controls using <video> element and MUI IconButtons.

Timeline.tsx — Trim slider using Slider and Box components.

RecorderDialog.tsx — Modal for choosing recording source and starting capture.

ExportDialog.tsx — Shows progress and completion state.

State Management:

Use Zustand or Context for storing clipPath, in/out points, and export status.

Keep file paths in memory, not persisted.

Backend (Rust + FFmpeg via Tauri Commands)
#[tauri::command]
fn run_ffmpeg(args: Vec<String>) -> Result<String, String> {
    // Spawn FFmpeg process
    let output = std::process::Command::new("ffmpeg")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stderr).to_string())
}


Handle import/export paths using Tauri FS APIs.

Detect OS and adjust FFmpeg flags accordingly.

FFmpeg Usage

Bundle static FFmpeg binaries or detect system install.

Example commands:

Trim:
ffmpeg -i input.mp4 -ss 00:00:03 -to 00:00:12 -c copy output.mp4

Screen Record (macOS):
ffmpeg -f avfoundation -framerate 30 -i "1" screen.mp4

Screen Record (Windows):
ffmpeg -f gdigrab -framerate 30 -i desktop screen.mp4

Camera Record:
ffmpeg -f avfoundation -framerate 30 -i "0" camera.mp4

6. UI Design Notes

Visual Language:
CapCut-inspired dark theme using MUI’s createTheme({ palette: { mode: 'dark' } }).

Layout Overview:

Top Bar: Import | Record | Export (MUI AppBar + Buttons)

Center: Video preview inside Card

Bottom: Trim timeline with MUI Slider

Dialogs: For recording and export progress (Dialog, LinearProgress)

Example Theme Snippet:

const theme = createTheme({
  palette: { mode: 'dark', primary: { main: '#00bcd4' } },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 8 } } }
  }
});

7. Success Criteria
Metric	Definition
App launches	Runs natively on macOS/Windows via tauri build.
Video import works	Drag & drop recognized and preview plays.
Trim & export works	FFmpeg trims and exports correctly.
Screen recording	OS permissions granted and FFmpeg saves video.
Camera recording	Webcam footage successfully saved.
8. 72-Hour Timeline
Day	Focus	Deliverables
Day 1 (Oct 27)	Setup & FFmpeg bridge	Tauri + MUI setup, test native FFmpeg from Rust
Day 2 (Oct 28)	Core editing flow	Import → Trim → Export working, timeline functional
Day 3 (Oct 29)	Recording + polish	Screen & camera capture, dialogs, packaging
9. Risks & Mitigations
Risk	Impact	Mitigation
FFmpeg permissions	Capture fails initially	Run once from Terminal manually to trigger OS prompt
Platform differences	Capture args differ	Detect OS via std::env::consts::OS and adjust flags
Large file I/O	UI freeze during export	Run FFmpeg async, show progress in MUI LinearProgress
App size	Bundling FFmpeg increases binary	Optionally detect system FFmpeg if available
10. Deliverables

✅ Cross-platform Tauri app (.app / .exe)

✅ Core editing flow (import, preview, trim, export)

✅ Native screen + camera recording (post-permission)