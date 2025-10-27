# PRD: Screen Recording

**Feature**: Native Screen Capture via FFmpeg
**Priority**: P1 (High)
**Estimated Time**: 5-6 hours
**Dependencies**: PRD-01 (App Launch & Setup)

---

## Overview

Enable users to record their screen directly from ClipForge using FFmpeg's native screen capture capabilities. Handle platform-specific differences (macOS vs Windows) and OS permission requirements.

---

## Goals

- Capture full desktop screen using FFmpeg
- Handle macOS and Windows platform differences
- Guide users through permission setup (macOS Screen Recording permission)
- Show recording indicator (timer, file size)
- Save recording to user-selected location
- Auto-import recording into editor after stopping

---

## Implementation Steps

### Step 1: Create Platform-Specific FFmpeg Commands (60 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Add OS detection and screen recording command:

```rust
use std::sync::{Arc, Mutex};
use std::thread;

// Global state to track recording process
lazy_static::lazy_static! {
    static ref RECORDING_PROCESS: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
}

#[tauri::command]
fn start_screen_recording(
    output_path: String,
    window: tauri::Window
) -> Result<String, String> {
    // Platform-specific FFmpeg arguments
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-i", "1",              // Screen capture (1 = main display)
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "gdigrab",
            "-framerate", "30",
            "-i", "desktop",
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
        .map_err(|e| format!("Failed to start FFmpeg: {}. Make sure you have granted screen recording permissions.", e))?;

    // Store process in global state
    let mut process = RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    // Spawn thread to monitor FFmpeg output
    let window_clone = window.clone();
    thread::spawn(move || {
        // Monitor stderr for errors
        // (In production, you might want to emit progress events here)
    });

    Ok("Recording started".to_string())
}

#[tauri::command]
fn stop_screen_recording() -> Result<String, String> {
    let mut process = RECORDING_PROCESS.lock().unwrap();

    if let Some(mut child) = process.take() {
        // Send 'q' to FFmpeg stdin to gracefully stop
        // For now, we'll kill the process
        child.kill()
            .map_err(|e| format!("Failed to stop recording: {}", e))?;

        child.wait()
            .map_err(|e| format!("Failed to wait for FFmpeg: {}", e))?;

        Ok("Recording stopped".to_string())
    } else {
        Err("No recording in progress".to_string())
    }
}

#[tauri::command]
fn is_recording() -> bool {
    let process = RECORDING_PROCESS.lock().unwrap();
    process.is_some()
}
```

2. Add `lazy_static` dependency to `src-tauri/Cargo.toml`:

```toml
[dependencies]
lazy_static = "1.4"
# ... other dependencies
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
            start_screen_recording,  // Add
            stop_screen_recording,   // Add
            is_recording             // Add
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Platform differences:**
- **macOS**: Uses `avfoundation` framework with device "1" (main screen)
- **Windows**: Uses `gdigrab` (GDI screen grabber)
- **Codec**: H.264 with ultrafast preset for real-time encoding

---

### Step 2: Create Recording Dialog Component (75 minutes)

**File to create:** `src/components/RecordingDialog.tsx`

**What to do:**
1. Create `src/components/RecordingDialog.tsx`:

```typescript
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import {
  FiberManualRecord,
  Stop,
  Videocam,
  DesktopWindows
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/tauri';
import { useVideoStore } from '../store/videoStore';

interface RecordingDialogProps {
  open: boolean;
  onClose: () => void;
}

type RecordingSource = 'screen' | 'camera';

function RecordingDialog({ open, onClose }: RecordingDialogProps) {
  const [source, setSource] = useState<RecordingSource>('screen');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setVideo = useVideoStore((state) => state.setVideo);

  // Timer for recording duration
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const handleStartRecording = async () => {
    setError(null);

    try {
      // Prompt for save location
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const defaultName = `${source}-recording-${timestamp}.mp4`;

      const savePath = await invoke<string>('save_file_dialog', {
        defaultFilename: defaultName
      });

      if (!savePath) return; // User cancelled

      const finalPath = savePath.endsWith('.mp4') ? savePath : `${savePath}.mp4`;
      setOutputPath(finalPath);

      // Start recording based on source
      if (source === 'screen') {
        await invoke('start_screen_recording', { outputPath: finalPath });
      } else {
        await invoke('start_camera_recording', { outputPath: finalPath });
      }

      setIsRecording(true);
      setRecordingTime(0);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError(err.toString());
    }
  };

  // Stop recording
  const handleStopRecording = async () => {
    try {
      if (source === 'screen') {
        await invoke('stop_screen_recording');
      } else {
        await invoke('stop_camera_recording');
      }

      setIsRecording(false);

      // Auto-import the recording
      if (outputPath) {
        const fileName = outputPath.split('/').pop() || outputPath.split('\\').pop() || 'recording.mp4';
        setVideo(outputPath, fileName);
      }

      // Close dialog
      onClose();
      resetState();

    } catch (err: any) {
      console.error('Failed to stop recording:', err);
      setError(err.toString());
    }
  };

  // Reset state
  const resetState = () => {
    setIsRecording(false);
    setRecordingTime(0);
    setOutputPath(null);
    setError(null);
    setSource('screen');
  };

  // Cleanup on close
  const handleClose = () => {
    if (!isRecording) {
      resetState();
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Record Video</DialogTitle>

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

            {/* macOS Permission Notice */}
            {source === 'screen' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>First time?</strong> You'll need to grant screen recording permission in System Preferences.
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
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {/* Recording Indicator */}
            <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3 }}>
              <CircularProgress
                size={100}
                thickness={2}
                sx={{
                  color: 'error.main',
                  animation: 'pulse 2s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 }
                  }
                }}
              />
              <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <FiberManualRecord sx={{ fontSize: 40, color: 'error.main' }} />
              </Box>
            </Box>

            <Typography variant="h4" gutterBottom>
              {formatTime(recordingTime)}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Recording {source}...
            </Typography>

            {outputPath && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, wordBreak: 'break-all' }}>
                Saving to: {outputPath}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {!isRecording ? (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleStartRecording}
              variant="contained"
              startIcon={<FiberManualRecord />}
              color="error"
            >
              Start Recording
            </Button>
          </>
        ) : (
          <Button
            onClick={handleStopRecording}
            variant="contained"
            startIcon={<Stop />}
            fullWidth
          >
            Stop Recording
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default RecordingDialog;
```

**Features:**
- Source selection (screen or camera)
- Recording timer with circular progress indicator
- macOS permission notice
- Auto-import after recording
- Can't close dialog while recording
- Error handling

---

### Step 3: Create Record Button Component (20 minutes)

**File to create:** `src/components/RecordButton.tsx`

**What to do:**
1. Create `src/components/RecordButton.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import RecordingDialog from './RecordingDialog';

function RecordButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        color="inherit"
        startIcon={<FiberManualRecord />}
        onClick={() => setDialogOpen(true)}
        sx={{ mr: 2 }}
      >
        Record
      </Button>

      <RecordingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

export default RecordButton;
```

---

### Step 4: Update Editor Layout (10 minutes)

**File to edit:** `src/components/EditorLayout.tsx`

**What to do:**
1. Import RecordButton:
```typescript
import RecordButton from './RecordButton';
```

2. Replace static Record button:

```typescript
{/* Before */}
<Button color="inherit" startIcon={<FiberManualRecord />} sx={{ mr: 2 }}>
  Record
</Button>

{/* After */}
<RecordButton />
```

---

### Step 5: Add macOS Permission Instructions (30 minutes)

**File to create:** `docs/PERMISSIONS.md`

**What to do:**
1. Create helpful permission setup guide:

```markdown
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
```

---

### Step 6: Add Permission Check Dialog (45 minutes)

**File to create:** `src/components/PermissionHelper.tsx`

**What to do:**
1. Create a helper component to guide users through permissions:

```typescript
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Box
} from '@mui/material';

interface PermissionHelperProps {
  open: boolean;
  onClose: () => void;
}

function PermissionHelper({ open, onClose }: PermissionHelperProps) {
  const isMac = navigator.platform.toLowerCase().includes('mac');

  if (!isMac) {
    // Windows doesn't need permission setup
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Screen Recording Permission Required</DialogTitle>

      <DialogContent>
        <Typography variant="body2" paragraph>
          ClipForge needs permission to record your screen. Follow these steps:
        </Typography>

        <Stepper orientation="vertical">
          <Step active>
            <StepLabel>Open System Preferences</StepLabel>
            <StepContent>
              <Typography variant="body2">
                Click the Apple menu → System Preferences (or System Settings)
              </Typography>
            </StepContent>
          </Step>

          <Step active>
            <StepLabel>Navigate to Privacy</StepLabel>
            <StepContent>
              <Typography variant="body2">
                Go to Security & Privacy → Privacy tab
              </Typography>
            </StepContent>
          </Step>

          <Step active>
            <StepLabel>Enable Screen Recording</StepLabel>
            <StepContent>
              <Typography variant="body2">
                1. Select "Screen Recording" from the left sidebar<br />
                2. Click the lock icon to make changes<br />
                3. Check the box next to "ClipForge"<br />
                4. Restart ClipForge
              </Typography>
            </StepContent>
          </Step>
        </Stepper>

        <Box sx={{ mt: 3, p: 2, backgroundColor: 'background.default', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Note:</strong> You only need to do this once. After granting permission, restart ClipForge for changes to take effect.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Got It</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PermissionHelper;
```

2. Add link to this helper in `RecordingDialog.tsx`:

```typescript
// In the Alert component, add a button:
<Alert
  severity="info"
  sx={{ mb: 2 }}
  action={
    <Button size="small" onClick={() => setShowPermissionHelper(true)}>
      Help
    </Button>
  }
>
  <Typography variant="body2">
    <strong>First time?</strong> You'll need to grant screen recording permission.
  </Typography>
</Alert>

{/* Add state and dialog */}
const [showPermissionHelper, setShowPermissionHelper] = useState(false);

<PermissionHelper
  open={showPermissionHelper}
  onClose={() => setShowPermissionHelper(false)}
/>
```

---

### Step 7: Test Screen Recording (30 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test permission setup (macOS only):**
   - Click "Record" button
   - Select "Screen"
   - Click "Start Recording"
   - macOS should prompt for permission
   - Grant permission
   - **Restart ClipForge**

3. **Test screen recording:**
   - Click "Record"
   - Select "Screen"
   - Click "Start Recording"
   - Choose save location
   - Verify timer starts counting
   - Move windows around (to see in recording)
   - Click "Stop Recording"
   - Verify recording auto-imports
   - Play recording in editor
   - Verify screen content is visible

4. **Test error handling:**
   - On macOS, revoke permission
   - Try recording again
   - Should see helpful error message

**Expected behavior:**
- Recording starts within 2-3 seconds
- Timer counts up smoothly
- Stop button ends recording
- File is saved to chosen location
- Recording auto-imports and plays

---

## Success Criteria

- [ ] Record button opens dialog
- [ ] Can select between screen and camera
- [ ] macOS permission prompt appears (first time)
- [ ] Recording starts and timer counts
- [ ] Screen content is captured
- [ ] Stop button ends recording
- [ ] Recording auto-imports into editor
- [ ] Recorded video plays correctly
- [ ] Permission helper dialog is accessible
- [ ] Works on both macOS and Windows

---

## Common Issues & Solutions

### Issue: "Cannot find device" on macOS
**Solution**:
- Run `ffmpeg -f avfoundation -list_devices true -i ""`
- Check that display shows as device "1"
- Some systems may use device "0" - update code if needed

### Issue: Black screen in recording
**Solution**:
- Permissions not granted properly
- Restart ClipForge after granting permission
- Try revoking and re-granting permission

### Issue: Recording is laggy/choppy
**Solution**:
- Lower framerate (change `30` to `15` or `24`)
- Use faster preset (already using `ultrafast`)
- Reduce recording resolution (add `-s 1280x720`)

### Issue: Large file sizes
**Solution**:
- Expected with `ultrafast` preset
- For smaller files, use `-preset medium` (slower encoding)
- Or re-encode after recording with better compression

### Issue: FFmpeg process won't stop
**Solution**:
- Currently using `kill()` which is forceful
- Better: Send 'q' to stdin (requires more complex implementation)

---

## Optional Enhancements (Post-MVP)

- Select specific display (multi-monitor support)
- Record specific window only
- Adjust framerate and quality settings
- Include system audio
- Record screen + camera simultaneously (picture-in-picture)
- Countdown before recording starts
- Hotkey to stop recording

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-07: Camera Recording** for webcam capture
2. Screen recording is the foundation - camera uses similar approach

---

## Files Created/Modified

- ✅ `src/components/RecordingDialog.tsx` (new)
- ✅ `src/components/RecordButton.tsx` (new)
- ✅ `src/components/PermissionHelper.tsx` (new)
- ✅ `src/components/EditorLayout.tsx` (modified)
- ✅ `src-tauri/src/main.rs` (modified - added 3 commands)
- ✅ `src-tauri/Cargo.toml` (modified - added lazy_static)
- ✅ `docs/PERMISSIONS.md` (new)
