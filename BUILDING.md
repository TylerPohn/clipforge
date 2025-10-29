# Building ClipForge for Production

This guide explains how to build ClipForge for production distribution on macOS and Windows.

## Prerequisites

- Node.js and npm installed
- Rust and Cargo installed
- For macOS builds: macOS with Xcode Command Line Tools
- For Windows builds: The build can be done on macOS (cross-compilation)

## Step 1: Download FFmpeg Binaries

Before building, you need to download the FFmpeg binaries that will be bundled with the app:

```bash
cd src-tauri
./download-ffmpeg.sh
```

This script will automatically download:
- FFmpeg and FFprobe for macOS (both ARM64 and Intel)
- FFmpeg and FFprobe for Windows (64-bit)

The binaries will be placed in `src-tauri/binaries/` directory.

**Note:** These binaries are ~670MB total and are excluded from git. Each developer needs to download them locally.

## Step 2: Build the Application

### For macOS

```bash
npm run tauri:build
```

This will create:
- App bundle: `src-tauri/target/release/bundle/macos/clipforge.app`
- DMG installer: `src-tauri/target/release/bundle/dmg/clipforge_0.1.0_aarch64.dmg`

### For Windows

When building on Windows (or cross-compiling):

```bash
npm run tauri:build
```

This will create:
- Installer: `src-tauri/target/release/bundle/msi/clipforge_0.1.0_x64.msi`
- Portable exe: `src-tauri/target/release/clipforge.exe`

## Step 3: Test the Production Build

### On macOS

```bash
open src-tauri/target/release/bundle/macos/clipforge.app
```

Test the following features:
- ✅ Screen recording (with audio)
- ✅ Camera recording (with preview and audio)
- ✅ Video import and editing
- ✅ Video export

### On Windows

Run the installer or portable exe and test the same features.

## Important Notes

### FFmpeg Bundling

The app uses different FFmpeg binary paths in dev vs production:

- **Dev mode**: Uses system FFmpeg from PATH (`/opt/homebrew/bin/ffmpeg`, `C:\ffmpeg\bin\ffmpeg.exe`, etc.)
- **Production mode**: Uses bundled FFmpeg from `app.app/Contents/MacOS/ffmpeg` or next to the `.exe` on Windows

This is handled automatically by the `get_ffmpeg_path()` and `get_ffprobe_path()` helper functions in `src-tauri/src/lib.rs`.

### macOS Permissions

The app requires camera and microphone permissions. These are declared in `src-tauri/Info.plist`:

- `NSCameraUsageDescription`: For camera preview and recording
- `NSMicrophoneUsageDescription`: For audio recording

Users will be prompted to grant these permissions when they first use camera/recording features.

### File Sizes

Be aware of the binary sizes:
- macOS FFmpeg binaries: ~77MB each (x2 for Intel and ARM64)
- Windows FFmpeg binaries: ~182MB each
- Total app bundle size: ~200-300MB

## Troubleshooting

### "FFmpeg not found" error in production

If you get FFmpeg errors in production builds:
1. Verify binaries are in `src-tauri/binaries/` before building
2. Check that binaries are named correctly (e.g., `ffmpeg-aarch64-apple-darwin`, not just `ffmpeg`)
3. Verify the bundled app contains the binaries:
   ```bash
   ls -la src-tauri/target/release/bundle/macos/clipforge.app/Contents/MacOS/
   ```

### Camera preview not working

If camera preview doesn't work:
1. Check that `src-tauri/Info.plist` exists with camera permissions
2. Verify the Info.plist was merged into the bundle:
   ```bash
   plutil -p src-tauri/target/release/bundle/macos/clipforge.app/Contents/Info.plist | grep -i camera
   ```
3. Grant camera permissions in System Settings > Privacy & Security > Camera

### Build fails with "binary not found"

Re-run the download script:
```bash
cd src-tauri
./download-ffmpeg.sh
```

## Continuous Integration

For CI/CD pipelines, add this step before building:

```yaml
- name: Download FFmpeg binaries
  run: |
    cd src-tauri
    ./download-ffmpeg.sh
```

The binaries should NOT be committed to git due to their size.
