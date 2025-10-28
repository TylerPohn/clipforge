# Setting Up Screen Recording Permissions

## macOS

ClipForge needs screen recording permission to capture your screen.

### First-Time Setup

1. Click "Record" in ClipForge
2. Select "Screen" as the source
3. Click "Start Recording"
4. You'll see a system dialog: "ClipForge would like to record this computer's screen"
5. Click "Allow" or "OK"

### If Recording Fails

If you don't see the permission dialog or recording fails:

1. Open **System Preferences** (or **System Settings** on macOS 13+)
2. Go to **Security & Privacy** → **Privacy**
3. Select **Screen Recording** from the left sidebar
4. Find **ClipForge** in the list
5. Check the box next to ClipForge
6. **Restart ClipForge** (important!)

### Alternative: Manual Permission Grant

Run this command in Terminal to test permissions:

```bash
ffmpeg -f avfoundation -list_devices true -i ""
```

This will trigger the permission dialog if not already granted.

## Windows

No special permissions needed! Screen recording works out of the box with `gdigrab`.

## Troubleshooting

### Black screen in recording
- Permissions not granted
- Try restarting ClipForge after granting permission

### "Cannot find device" error
- On macOS: Check that device "1" exists by running:
  ```bash
  ffmpeg -f avfoundation -list_devices true -i ""
  ```
- You should see your screen listed as device "1"

### Recording crashes immediately
- FFmpeg not installed
- Install with: `brew install ffmpeg` (macOS) or download from ffmpeg.org (Windows)
