# ClipForge

A powerful desktop video editor built with Tauri, React, and TypeScript. Edit, trim, and record videos with an intuitive interface.

## Features

### Video Editing
- **Trim Videos** - Precisely cut video clips with frame-accurate controls
- **Concatenate Clips** - Combine multiple video clips into a single sequence
- **Split Videos** - Split a single video into multiple clips at any point
- **Picture-in-Picture (PiP)** - Add overlay videos with customizable position and size
  - Adjustable corner placement (top-left, top-right, bottom-left, bottom-right)
  - Multiple size presets (25%, 33%, 50%)
  - Volume control for PiP audio
- **Drag & Drop Import** - Easily import MP4 and MOV files by dragging them into the app
- **File Selector Import** - Import MP4 and MOV files using native file selector

### Recording
- **Screen Recording** - Capture your screen with live preview
  - Real-time preview before and during recording
  - Optional microphone audio recording
  - Multiple resolution options (720p, 1080p, source)
  - macOS and Windows support
- **Camera Recording** - Record from your webcam
  - Live camera preview
  - Built-in audio recording (with microphone selection on Windows)
  - Customizable resolution settings

### Export Options
- **Flexible Resolution** - Export at 720p, 1080p, or source resolution
- **Optimized Encoding** - Automatic bitrate selection based on resolution
- **Fast Processing** - Hardware-accelerated encoding with FFmpeg

## Architecture

ClipForge is built using a modern, cross-platform architecture that combines web technologies with native performance:

### Tech Stack

**Frontend**
- **React 18** - UI framework with hooks for state management
- **TypeScript** - Type-safe development
- **Material-UI (MUI)** - Component library for consistent design
- **Vite** - Fast build tool and dev server
- **Zustand** - Lightweight state management for video clips and settings

**Backend**
- **Rust** - High-performance native backend
- **Tauri 2** - Cross-platform framework bridging Rust and web frontend
- **FFmpeg** - Video processing engine for encoding, trimming, and concatenation
  - Platform-specific capture APIs (AVFoundation on macOS, DirectShow on Windows)
  - MJPEG streaming for real-time screen preview

### How It Works

1. **Frontend UI** - React components provide the user interface, video controls, and timeline
2. **Tauri Bridge** - TypeScript invokes Rust commands via Tauri's IPC (Inter-Process Communication)
3. **Rust Backend** - Handles all file operations, FFmpeg process management, and video processing
4. **FFmpeg Processing** - Rust spawns FFmpeg processes for video operations (trim, concat, encode, record)
5. **Event Streaming** - Real-time preview frames are streamed from Rust to frontend via Tauri events

### Key Design Decisions

- **Native Video Processing** - All video operations run in Rust with FFmpeg for maximum performance
- **Reactive State** - Zustand provides minimal, fast state management for clip timeline and playback
- **Event-Driven Preview** - Screen recording preview uses base64-encoded JPEG frames sent via Tauri events
- **Platform-Specific APIs** - Recording leverages native capture APIs for best quality and compatibility

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
