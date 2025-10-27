# ClipForge Implementation Guide

**72-Hour Video Editor Build**
**Tech Stack**: Tauri + React + Material UI + FFmpeg

---

## Quick Start

This guide walks you through implementing ClipForge, a native desktop video editor, in 7 major features over 72 hours.

### Prerequisites

- **Node.js** 16+ and **npm**
- **Rust** 1.70+
- **FFmpeg** installed and in PATH
  - macOS: `brew install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org)
- Basic knowledge of React and TypeScript

---

## Implementation Order

Follow these PRDs in order. Each builds on the previous:

| Day | PRD | Feature | Time | Status |
|-----|-----|---------|------|--------|
| **Day 1** | [PRD-01](PRD-01-App-Launch-Setup.md) | App Launch & Setup | 4-6h | ⬜ |
| **Day 1** | [PRD-02](PRD-02-Video-Import.md) | Video Import | 4-5h | ⬜ |
| **Day 2** | [PRD-03](PRD-03-Preview-Player.md) | Preview Player | 3-4h | ⬜ |
| **Day 2** | [PRD-04](PRD-04-Timeline-Trim.md) | Timeline & Trim | 4-5h | ⬜ |
| **Day 2** | [PRD-05](PRD-05-Video-Export.md) | Video Export | 4-5h | ⬜ |
| **Day 3** | [PRD-06](PRD-06-Screen-Recording.md) | Screen Recording | 5-6h | ⬜ |
| **Day 3** | [PRD-07](PRD-07-Camera-Recording.md) | Camera Recording | 3-4h | ⬜ |

**Total**: ~27-35 hours of active coding + testing/debugging

---

## Day-by-Day Breakdown

### Day 1 (Oct 27): Foundation & Core Import

**Goal**: Get the app running with video import capabilities

#### Morning (4-6 hours)
- **PRD-01: App Launch & Setup**
  - Initialize Tauri project
  - Install Material UI
  - Create dark theme
  - Build basic layout (AppBar, content area, timeline placeholder)
  - Test app launches

**Checkpoint**: App opens with dark theme and basic UI

#### Afternoon (4-5 hours)
- **PRD-02: Video Import**
  - Set up Zustand state management
  - Create file picker (Rust command)
  - Implement drag-and-drop
  - Add FFprobe metadata extraction
  - Display video info chips

**Checkpoint**: Can import videos via drag-drop or file picker, metadata displays

---

### Day 2 (Oct 28): Editing Workflow

**Goal**: Complete the core editing loop (import → trim → export)

#### Morning (3-4 hours)
- **PRD-03: Preview Player**
  - Build video player component
  - Add play/pause controls
  - Implement seek slider
  - Add keyboard shortcuts (Space, arrows, J/K/L)

**Checkpoint**: Imported videos play with full controls

#### Midday (4-5 hours)
- **PRD-04: Timeline & Trim**
  - Create canvas-based timeline
  - Implement draggable trim handles
  - Add playhead visualization
  - Keyboard shortcuts for trim (I/O keys)
  - Sync player with trim bounds

**Checkpoint**: Can set trim points visually and via keyboard

#### Afternoon (4-5 hours)
- **PRD-05: Video Export**
  - Create FFmpeg trim command (Rust)
  - Build export dialog with progress
  - Add save file picker
  - Show success/error states
  - "Open Folder" button

**Checkpoint**: Trimmed videos export successfully

---

### Day 3 (Oct 29): Recording Features & Polish

**Goal**: Add recording capabilities and polish the app

#### Morning (5-6 hours)
- **PRD-06: Screen Recording**
  - Implement platform-specific screen capture
    - macOS: `avfoundation`
    - Windows: `gdigrab`
  - Create recording dialog
  - Handle permissions (macOS screen recording)
  - Recording timer and indicator
  - Auto-import after recording

**Checkpoint**: Can record screen and auto-load into editor

#### Afternoon (3-4 hours)
- **PRD-07: Camera Recording**
  - Add camera capture (FFmpeg)
    - macOS: `avfoundation` device "0"
    - Windows: `dshow`
  - Browser-based camera preview
  - Handle camera permissions
  - Reuse recording UI from PRD-06

**Checkpoint**: Can record from webcam

#### Evening (2-3 hours)
- **Testing & Bug Fixes**
  - Test full import → edit → export workflow
  - Test full record → edit → export workflow
  - Fix any critical bugs
  - Test on both macOS and Windows (if possible)

---

## Critical Dependencies

### Install These First

1. **Tauri CLI**
   ```bash
   npm install -g @tauri-apps/cli
   ```

2. **FFmpeg**
   ```bash
   # macOS
   brew install ffmpeg

   # Windows
   # Download from https://ffmpeg.org and add to PATH
   ```

3. **Rust Dependencies** (auto-installed)
   - `lazy_static` (for recording state)
   - `serde` (for JSON serialization)

---

## File Structure Overview

After completing all PRDs, your project should look like:

```
clipforge/
├── src/                          # React frontend
│   ├── components/
│   │   ├── EditorLayout.tsx
│   │   ├── VideoPlayer.tsx
│   │   ├── Timeline.tsx
│   │   ├── TimelineRuler.tsx
│   │   ├── ImportButton.tsx
│   │   ├── DropZone.tsx
│   │   ├── ExportButton.tsx
│   │   ├── ExportDialog.tsx
│   │   ├── RecordButton.tsx
│   │   ├── RecordingDialog.tsx
│   │   ├── CameraPreview.tsx
│   │   └── PermissionHelper.tsx
│   ├── hooks/
│   │   ├── useVideoMetadata.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useCameraDevices.ts
│   ├── store/
│   │   └── videoStore.ts
│   ├── theme.ts
│   └── App.tsx
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   └── main.rs               # All Tauri commands
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/
    ├── PRD.md                    # Original master PRD
    ├── PRD-01-App-Launch-Setup.md
    ├── PRD-02-Video-Import.md
    ├── PRD-03-Preview-Player.md
    ├── PRD-04-Timeline-Trim.md
    ├── PRD-05-Video-Export.md
    ├── PRD-06-Screen-Recording.md
    ├── PRD-07-Camera-Recording.md
    ├── PERMISSIONS.md
    └── IMPLEMENTATION-GUIDE.md   # This file
```

---

## Tauri Commands Reference

By the end, you'll have these Rust commands:

| Command | PRD | Purpose |
|---------|-----|---------|
| `open_file_dialog` | 02 | Open native file picker |
| `save_file_dialog` | 05 | Save file dialog for export |
| `get_video_metadata` | 02 | Extract video info via FFprobe |
| `trim_video` | 05 | Export trimmed video via FFmpeg |
| `start_screen_recording` | 06 | Begin screen capture |
| `stop_screen_recording` | 06 | End screen capture |
| `is_recording` | 06 | Check recording status |
| `start_camera_recording` | 07 | Begin camera capture |
| `stop_camera_recording` | 07 | End camera capture |
| `is_camera_recording` | 07 | Check camera status |
| `list_camera_devices` | 07 | List available cameras |

---

## Testing Checklist

After completing all PRDs, verify:

### Import & Playback
- [ ] Drag-and-drop video file
- [ ] Click Import button to select file
- [ ] Video metadata displays (name, duration, resolution)
- [ ] Video plays in player
- [ ] Play/pause works
- [ ] Seek slider works
- [ ] Volume control works

### Trim & Export
- [ ] Drag trim handles on timeline
- [ ] Press I to set in point
- [ ] Press O to set out point
- [ ] Video respects trim bounds during playback
- [ ] Click Export opens save dialog
- [ ] Progress bar shows during export
- [ ] Exported video has correct duration
- [ ] Exported video quality is good
- [ ] "Open Folder" reveals file

### Screen Recording
- [ ] Click Record → Screen
- [ ] Permission prompt appears (macOS first time)
- [ ] Recording starts and timer counts
- [ ] Screen content is captured
- [ ] Stop button ends recording
- [ ] Recording auto-imports
- [ ] Can edit and export recording

### Camera Recording
- [ ] Click Record → Camera
- [ ] Browser camera preview works
- [ ] Permission prompts appear
- [ ] Recording captures camera feed
- [ ] Can edit and export camera recording

### Keyboard Shortcuts
- [ ] Space = play/pause
- [ ] ← = back 5 seconds
- [ ] → = forward 5 seconds
- [ ] I = set trim in point
- [ ] O = set trim out point
- [ ] K = play/pause
- [ ] J/L = frame step

---

## Common Issues Across All PRDs

### FFmpeg Issues

**"FFmpeg not found"**
- Install FFmpeg: `brew install ffmpeg` (macOS)
- Add FFmpeg to PATH (Windows)
- Verify: `ffmpeg -version`

**"Permission denied" (macOS)**
- Screen recording: System Preferences → Security → Screen Recording
- Camera: System Preferences → Security → Camera
- **Must restart app** after granting permissions

**Export/Recording fails silently**
- Check FFmpeg stderr output in Rust console
- Common issue: Codec incompatibility (remove `-c copy` to re-encode)

### Tauri Issues

**"Tauri command not found"**
- Verify command is registered in `tauri::generate_handler![]`
- Check command name matches exactly (case-sensitive)

**File paths not working**
- Use `convertFileSrc()` for video elements
- Check `assetScope: ["**"]` in tauri.conf.json

### React/MUI Issues

**Dark theme not applying**
- Verify `ThemeProvider` wraps entire app
- Check `CssBaseline` is included

**State not updating**
- Verify Zustand store subscriptions
- Check that you're not mutating state directly

---

## Performance Tips

### For Smooth Playback
- Use `-c copy` when trimming (fast, no re-encode)
- Only works if trim points align with keyframes
- If seeking is laggy, it's normal for some codecs

### For Smaller File Sizes
- Recording uses `-preset ultrafast` (fast but large files)
- To reduce size, re-export with `-preset medium`
- Or adjust framerate: `-framerate 24` instead of 30

### For Real-Time Recording
- 720p is a good balance (resolution in recording commands)
- Lower to 480p if lagging: `-video_size 640x480`
- Faster preset = larger files but less CPU during recording

---

## Building for Production

Once all features work in dev mode:

```bash
# Build for production
npm run tauri build
```

**Output locations:**
- **macOS**: `src-tauri/target/release/bundle/macos/ClipForge.app`
- **Windows**: `src-tauri/target/release/bundle/msi/ClipForge.msi`

**First build takes 10-15 minutes** (compiles Rust dependencies)

---

## What's NOT Included (Future Enhancements)

These are out of scope for the 72-hour MVP but could be added later:

- Multi-track editing
- Video effects and transitions
- Audio editing and normalization
- Text overlays and titles
- Multiple export formats
- Cloud storage integration
- Collaboration features
- Mobile versions
- Advanced color grading
- Motion tracking
- Greenscreen/chroma key

---

## Resources

### Documentation
- [Tauri Docs](https://tauri.app/v1/guides/)
- [Material UI Docs](https://mui.com/material-ui/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Zustand Docs](https://github.com/pmndrs/zustand)

### Helpful FFmpeg Commands

```bash
# List camera devices (macOS)
ffmpeg -f avfoundation -list_devices true -i ""

# List camera devices (Windows)
ffmpeg -f dshow -list_devices true -i dummy

# Get video metadata
ffprobe -v quiet -print_format json -show_format -show_streams video.mp4

# Trim video (fast, no re-encode)
ffmpeg -i input.mp4 -ss 00:00:05 -to 00:00:15 -c copy output.mp4

# Record screen (macOS)
ffmpeg -f avfoundation -framerate 30 -i "1" screen.mp4

# Record camera (macOS)
ffmpeg -f avfoundation -framerate 30 -i "0" camera.mp4
```

---

## Support & Troubleshooting

If you get stuck:

1. **Check the specific PRD** - Each has a "Common Issues & Solutions" section
2. **Check PERMISSIONS.md** - Most macOS issues are permission-related
3. **Console logs** - Check both browser console and Rust console
4. **FFmpeg directly** - Test FFmpeg commands in terminal first
5. **Tauri Discord** - Active community for Tauri-specific issues

---

## Success Criteria

You've successfully built ClipForge when:

✅ App launches natively on your OS
✅ You can import a video and see it play
✅ You can trim a video using the timeline
✅ You can export the trimmed video
✅ You can record your screen
✅ You can record from your camera
✅ All keyboard shortcuts work
✅ The app feels smooth and responsive

**Congratulations!** You've built a functional native video editor in 72 hours.

---

## Next Steps After MVP

1. **User Testing**
   - Share with friends/colleagues
   - Gather feedback on UX

2. **Bug Fixes**
   - Fix edge cases
   - Improve error messages

3. **Polish**
   - Add loading states
   - Improve animations
   - Better error recovery

4. **Documentation**
   - User guide
   - Video tutorials
   - FAQ

5. **Distribution**
   - Code signing (macOS)
   - Windows installer
   - GitHub releases

---

**Built with ❤️ in 72 hours**
