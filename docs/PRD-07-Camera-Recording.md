# PRD: Camera Recording

**Feature**: Native Webcam Capture via FFmpeg
**Priority**: P1 (High)
**Estimated Time**: 3-4 hours
**Dependencies**: PRD-06 (Screen Recording)

---

## Overview

Enable users to record from their webcam using FFmpeg. Similar to screen recording but captures from the camera device. Handle platform-specific camera inputs and provide preview before recording.

---

## Goals

- Capture video from default webcam using FFmpeg
- Handle macOS and Windows platform differences
- Show camera preview before starting recording
- Recording indicator and timer
- Auto-import recording after stopping
- Handle camera permissions gracefully

---

## Implementation Steps

### Step 1: Add Camera Recording Commands (45 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Add global state for camera recording (similar to screen recording):

```rust
lazy_static::lazy_static! {
    static ref RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    static ref CAMERA_RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
}
```

2. Add camera recording commands:

```rust
#[tauri::command]
fn start_camera_recording(
    output_path: String,
    window: tauri::Window
) -> Result<String, String> {
    // Platform-specific FFmpeg arguments for camera
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-video_size", "1280x720",
            "-i", "0",              // Camera device (0 = default camera)
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        // Note: On Windows, device name varies. This is a common default.
        // Users may need to adjust based on their system
        vec![
            "-f", "dshow",
            "-framerate", "30",
            "-video_size", "1280x720",
            "-i", "video=Integrated Camera",  // Common name, may vary
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            &output_path
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    // Start FFmpeg process
    let child = std::process::Command::new("ffmpeg")
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to start camera recording: {}. Make sure camera is not in use by another app.",
                e
            )
        })?;

    // Store process
    let mut process = CAMERA_RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    Ok("Camera recording started".to_string())
}

#[tauri::command]
fn stop_camera_recording() -> Result<String, String> {
    let mut process = CAMERA_RECORDING_PROCESS.lock().unwrap();

    if let Some(mut child) = process.take() {
        child.kill()
            .map_err(|e| format!("Failed to stop camera recording: {}", e))?;

        child.wait()
            .map_err(|e| format!("Failed to wait for FFmpeg: {}", e))?;

        Ok("Camera recording stopped".to_string())
    } else {
        Err("No camera recording in progress".to_string())
    }
}

#[tauri::command]
fn is_camera_recording() -> bool {
    let process = CAMERA_RECORDING_PROCESS.lock().unwrap();
    process.is_some()
}

#[tauri::command]
fn list_camera_devices() -> Result<Vec<String>, String> {
    // List available camera devices
    let output = if cfg!(target_os = "macos") {
        std::process::Command::new("ffmpeg")
            .args(&[
                "-f", "avfoundation",
                "-list_devices", "true",
                "-i", ""
            ])
            .output()
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("ffmpeg")
            .args(&[
                "-f", "dshow",
                "-list_devices", "true",
                "-i", "dummy"
            ])
            .output()
    } else {
        return Err("Unsupported platform".to_string());
    };

    match output {
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            // Parse device names from FFmpeg output
            // This is a simplified version - actual parsing would be more robust
            Ok(vec!["Default Camera".to_string()])
        }
        Err(e) => Err(format!("Failed to list devices: {}", e))
    }
}
```

3. Register the commands:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            get_video_metadata,
            trim_video,
            save_file_dialog,
            start_screen_recording,
            stop_screen_recording,
            is_recording,
            start_camera_recording,    // Add
            stop_camera_recording,     // Add
            is_camera_recording,       // Add
            list_camera_devices        // Add
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Platform differences:**
- **macOS**: Uses `avfoundation` with device "0" (default camera)
- **Windows**: Uses `dshow` (DirectShow) with device name
- **Resolution**: 720p for reasonable file sizes and performance

---

### Step 2: Create Camera Preview Component (60 minutes)

**File to create:** `src/components/CameraPreview.tsx`

**What to do:**
1. Create a component to show live camera preview using HTML5 getUserMedia:

```typescript
import { useEffect, useRef, useState } from 'react';
import { Box, Alert, Typography } from '@mui/material';
import { Videocam, VideocamOff } from '@mui/icons-material';

interface CameraPreviewProps {
  isActive: boolean;
}

function CameraPreview({ isActive }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!isActive) {
      // Stop stream when preview is not active
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    // Request camera access
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });

        setStream(mediaStream);
        setHasPermission(true);
        setError(null);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

      } catch (err: any) {
        console.error('Camera access error:', err);
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser.'
            : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a camera.'
            : `Camera error: ${err.message}`
        );
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <Box sx={{
      width: '100%',
      maxWidth: 400,
      mx: 'auto',
      mb: 2
    }}>
      {error ? (
        <Alert severity="error" icon={<VideocamOff />}>
          {error}
        </Alert>
      ) : (
        <Box sx={{
          position: 'relative',
          paddingTop: '75%', // 4:3 aspect ratio
          backgroundColor: 'black',
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />

          {!hasPermission && (
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2
            }}>
              <Videocam sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Requesting camera access...
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default CameraPreview;
```

**Features:**
- Live camera preview using browser's getUserMedia
- Handles permission requests
- Shows error messages for denied/missing camera
- Auto-stops stream when not needed
- 720p preview resolution

---

### Step 3: Update Recording Dialog for Camera (30 minutes)

**File to edit:** `src/components/RecordingDialog.tsx`

**What to do:**
1. Import CameraPreview:
```typescript
import CameraPreview from './CameraPreview';
```

2. Add camera preview in the dialog content (before error display):

```typescript
{/* Add this in DialogContent, when not recording */}
{!isRecording && source === 'camera' && (
  <CameraPreview isActive={source === 'camera'} />
)}
```

**Updated DialogContent section:**

```typescript
<DialogContent>
  {!isRecording ? (
    <Box>
      {/* Source Selection */}
      <Typography variant="subtitle2" gutterBottom>
        Choose recording source:
      </Typography>
      <ToggleButtonGroup
        value={source}
        exclusive
        onChange={(_, newSource) => {
          if (newSource) setSource(newSource);
        }}
        fullWidth
        sx={{ mb: 3 }}
      >
        <ToggleButton value="screen">
          <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
            <DesktopWindows />
            <Typography variant="caption">Screen</Typography>
          </Stack>
        </ToggleButton>
        <ToggleButton value="camera">
          <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
            <Videocam />
            <Typography variant="caption">Camera</Typography>
          </Stack>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Camera Preview */}
      {source === 'camera' && (
        <CameraPreview isActive={true} />
      )}

      {/* Permission notices */}
      {source === 'screen' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>First time?</strong> You'll need to grant screen recording permission.
          </Typography>
        </Alert>
      )}

      {source === 'camera' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>First time?</strong> You'll need to grant camera permission.
          </Typography>
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  ) : (
    {/* ... existing recording indicator ... */}
  )}
</DialogContent>
```

---

### Step 4: Add Windows Camera Device Detection (Optional - 30 minutes)

**File to create:** `src/hooks/useCameraDevices.ts`

**What to do:**
1. Create a hook to list available cameras using browser API:

```typescript
import { useState, useEffect } from 'react';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export function useCameraDevices() {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ video: true });

        // Get all video input devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices
          .filter(device => device.kind === 'videoinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId.slice(0, 5)}`
          }));

        setDevices(cameras);
      } catch (error) {
        console.error('Failed to enumerate cameras:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDevices();
  }, []);

  return { devices, loading };
}
```

2. Optionally use this in `RecordingDialog.tsx` to show camera selection dropdown:

```typescript
// Add to RecordingDialog component
const { devices } = useCameraDevices();

// Add select dropdown for camera choice
{source === 'camera' && devices.length > 1 && (
  <FormControl fullWidth sx={{ mb: 2 }}>
    <InputLabel>Camera</InputLabel>
    <Select
      value={selectedCamera}
      onChange={(e) => setSelectedCamera(e.target.value)}
    >
      {devices.map(device => (
        <MenuItem key={device.deviceId} value={device.deviceId}>
          {device.label}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```

---

### Step 5: Update Permission Documentation (15 minutes)

**File to edit:** `docs/PERMISSIONS.md`

**What to do:**
1. Add camera permission section:

```markdown
## Camera Permissions

### macOS

Camera access works similarly to screen recording:

1. Click "Record" → Select "Camera"
2. System will prompt: "ClipForge would like to access the camera"
3. Click "OK" to grant permission

**If camera doesn't work:**

1. Open **System Preferences** → **Security & Privacy**
2. Go to **Privacy** → **Camera**
3. Check the box next to **ClipForge**
4. Restart ClipForge

### Windows

Camera permissions are handled by Windows:

1. Click "Record" → Select "Camera"
2. Windows may show a camera access prompt
3. Click "Allow"

**If camera doesn't work:**

1. Open **Settings** → **Privacy** → **Camera**
2. Ensure "Allow apps to access your camera" is ON
3. Find ClipForge in the list and enable it

### Browser Permissions

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
```

---

### Step 6: Test Camera Recording (30 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test camera preview:**
   - Click "Record"
   - Select "Camera" source
   - Browser should prompt for camera permission
   - Grant permission
   - Verify live preview appears
   - Check that preview shows you correctly

3. **Test camera recording:**
   - With preview showing, click "Start Recording"
   - Choose save location
   - Verify recording indicator appears
   - Wave at camera (to see in recording)
   - Wait 5-10 seconds
   - Click "Stop Recording"
   - Verify recording auto-imports
   - Play recording
   - Verify you can see yourself in the recording

4. **Test error handling:**
   - Close all browser tabs accessing camera
   - Deny camera permission
   - Verify error message appears
   - Re-grant permission and retry

5. **Test switching sources:**
   - Open dialog
   - Select "Screen"
   - Switch to "Camera"
   - Verify preview loads
   - Switch back to "Screen"
   - Verify preview stops

**Expected behavior:**
- Preview loads within 2-3 seconds
- Recording captures camera feed
- Auto-import works after stopping
- Permissions are requested properly
- Error messages are helpful

---

## Success Criteria

- [ ] Camera preview shows live feed
- [ ] Browser prompts for camera permission
- [ ] System prompts for camera permission (macOS)
- [ ] Recording starts and timer counts
- [ ] Camera feed is captured in recording
- [ ] Stop button ends recording
- [ ] Recording auto-imports into editor
- [ ] Recorded video plays correctly
- [ ] Works on both macOS and Windows
- [ ] Switching between screen/camera works smoothly

---

## Common Issues & Solutions

### Issue: Camera preview is black
**Solution**:
- Permission not granted
- Refresh browser or restart app
- Check that camera LED is on (indicates active)

### Issue: Preview works but recording fails (Windows)
**Solution**:
- Device name mismatch
- Run: `ffmpeg -list_devices true -f dshow -i dummy`
- Find your camera's exact name
- Update device name in `start_camera_recording` command

### Issue: Preview works but recording fails (macOS)
**Solution**:
- Check that device "0" is your camera
- Run: `ffmpeg -f avfoundation -list_devices true -i ""`
- Camera should be listed as video device "0"

### Issue: "Camera in use" error
**Solution**:
- Close other apps using camera
- On macOS: Check Activity Monitor for apps accessing camera
- On Windows: Check Task Manager

### Issue: Multiple cameras, wrong one selected
**Solution**:
- Implement camera selection dropdown (optional enhancement)
- For now, code uses default camera (device "0")

---

## Optional Enhancements (Post-MVP)

- Camera selection dropdown (when multiple cameras)
- Adjust resolution and framerate
- Include audio from microphone
- Flip/mirror camera preview
- Apply filters or effects
- Record screen + camera simultaneously (PiP mode)
- Green screen / background removal

---

## Next Steps

Once this feature is complete:
1. All major features are done!
2. Test full workflow: Import → Trim → Export
3. Test full workflow: Record → Trim → Export
4. Polish UI and fix bugs
5. Build production binary
6. Write user documentation

---

## Files Created/Modified

- ✅ `src/components/CameraPreview.tsx` (new)
- ✅ `src/hooks/useCameraDevices.ts` (new)
- ✅ `src/components/RecordingDialog.tsx` (modified - added camera preview)
- ✅ `src-tauri/src/main.rs` (modified - added 4 commands)
- ✅ `docs/PERMISSIONS.md` (modified - added camera section)
