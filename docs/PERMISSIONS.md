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

---

# Camera Permissions

## macOS

Camera access works similarly to screen recording:

1. Click "Record" in ClipForge
2. Select "Camera" as the source
3. System will prompt: "ClipForge would like to access the camera"
4. Click "OK" to grant permission

### If Camera Doesn't Work

1. Open **System Preferences** → **Security & Privacy**
2. Go to **Privacy** → **Camera**
3. Check the box next to **ClipForge**
4. Restart ClipForge

## Windows

Camera permissions are handled by Windows:

1. Click "Record" → Select "Camera"
2. Windows may show a camera access prompt
3. Click "Allow"

### If Camera Doesn't Work

1. Open **Settings** → **Privacy** → **Camera**
2. Ensure "Allow apps to access your camera" is ON
3. Find ClipForge in the list and enable it

## Browser Permissions

ClipForge uses your browser for camera preview. You may see two permission prompts:

1. **Browser prompt**: For preview (in the app)
2. **System prompt**: For FFmpeg recording (actual capture)

Both need to be allowed for camera recording to work.

## Troubleshooting Camera

### "No camera found"
- Camera is disconnected
- Try plugging in an external webcam

### "Camera in use by another app"
- Close other apps using camera (Zoom, Skype, etc.)
- Restart ClipForge

### Windows: "Cannot open video device"
- Device name might be different
- Check device name with: `ffmpeg -list_devices true -f dshow -i dummy`
- Update device name in code if needed

### Camera preview is black
- Permission not granted
- Refresh browser or restart app
- Check that camera LED is on (indicates active)
