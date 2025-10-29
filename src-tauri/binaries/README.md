# FFmpeg Binaries

This directory contains the FFmpeg and FFprobe binaries that will be bundled with the ClipForge application.

## Setup for Development/Building

Before building the production app, you need to download the FFmpeg binaries:

### Automated Download (All Platforms)

Run the download script from the `src-tauri` directory:

```bash
cd src-tauri
./download-ffmpeg.sh
```

This will automatically download:

**macOS binaries:**
- `ffmpeg-aarch64-apple-darwin` (macOS ARM64 / Apple Silicon)
- `ffmpeg-x86_64-apple-darwin` (macOS Intel)
- `ffprobe-aarch64-apple-darwin` (macOS ARM64 / Apple Silicon)
- `ffprobe-x86_64-apple-darwin` (macOS Intel)

**Windows binaries:**
- `ffmpeg-x86_64-pc-windows-msvc.exe` (Windows 64-bit)
- `ffprobe-x86_64-pc-windows-msvc.exe` (Windows 64-bit)

The script downloads static builds from:
- macOS: [evermeet.cx](https://evermeet.cx/ffmpeg/)
- Windows: [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases)

## Binary Naming Convention

The binaries follow Rust's target triple naming convention:

- `ffmpeg-aarch64-apple-darwin` - macOS ARM64
- `ffmpeg-x86_64-apple-darwin` - macOS Intel
- `ffmpeg-x86_64-pc-windows-msvc.exe` - Windows 64-bit
- `ffprobe-aarch64-apple-darwin` - macOS ARM64
- `ffprobe-x86_64-apple-darwin` - macOS Intel
- `ffprobe-x86_64-pc-windows-msvc.exe` - Windows 64-bit

## Why These Binaries?

ClipForge uses FFmpeg for:
- Screen recording
- Camera recording
- Video preview
- Video trimming and concatenation
- Video export and compositing

In development mode, the app uses the system-installed FFmpeg. In production builds, these bundled binaries are used to ensure the app works out-of-the-box without requiring users to install FFmpeg separately.

## Git Ignore

These binaries should be added to `.gitignore` due to their large size. Each developer/builder needs to download them locally using the script above.
