# PRD: Video Export

**Feature**: Export Trimmed Video via FFmpeg
**Priority**: P0 (Blocker)
**Estimated Time**: 4-5 hours
**Dependencies**: PRD-04 (Timeline & Trim)

---

## Overview

Export the trimmed video segment using FFmpeg. The export should use the trim points set in the timeline, show progress during encoding, and notify the user when complete.

---

## Goals

- Execute FFmpeg trim command from Rust backend
- Show export progress dialog with percentage
- Allow user to choose export location
- Use efficient codec settings (copy codec when possible)
- Handle export errors gracefully
- Show success notification with "Open Folder" option

---

## Implementation Steps

### Step 1: Create FFmpeg Trim Command (45 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Add this command to execute FFmpeg for trimming:

```rust
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};

#[tauri::command]
fn trim_video(
    input_path: String,
    output_path: String,
    start_time: f64,
    end_time: f64,
    window: tauri::Window
) -> Result<String, String> {
    // Format time as HH:MM:SS.mmm
    fn format_time(seconds: f64) -> String {
        let hours = (seconds / 3600.0).floor() as u32;
        let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
        let secs = seconds % 60.0;
        format!("{:02}:{:02}:{:06.3}", hours, minutes, secs)
    }

    let start_str = format_time(start_time);
    let duration = end_time - start_time;

    // FFmpeg command with progress
    let mut child = Command::new("ffmpeg")
        .args(&[
            "-y",                    // Overwrite output file
            "-ss", &start_str,       // Start time
            "-i", &input_path,       // Input file
            "-t", &duration.to_string(), // Duration
            "-c", "copy",            // Copy codec (fast, no re-encode)
            "-avoid_negative_ts", "make_zero",
            &output_path
        ])
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    // Read FFmpeg progress from stderr
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);

        for line in reader.lines() {
            if let Ok(line) = line {
                // FFmpeg outputs progress info to stderr
                // Look for "time=" to track progress
                if line.contains("time=") {
                    // Emit progress event to frontend
                    window.emit("export-progress", line.clone()).ok();
                }
            }
        }
    }

    // Wait for FFmpeg to finish
    let status = child.wait()
        .map_err(|e| format!("Failed to wait for FFmpeg: {}", e))?;

    if status.success() {
        Ok(output_path)
    } else {
        Err(format!("FFmpeg exited with status: {}", status))
    }
}
```

2. Register the command:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            get_video_metadata,
            trim_video  // Add this
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**What this does:**
- Uses FFmpeg `-ss` (start time) and `-t` (duration) flags
- Uses `-c copy` to copy codec (fast, no quality loss)
- Captures stderr for progress updates
- Emits progress events to frontend
- Returns output path on success

---

### Step 2: Create Save File Dialog Command (20 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Add a command to choose save location:

```rust
#[tauri::command]
fn save_file_dialog(default_filename: String) -> Result<String, String> {
    use std::sync::mpsc::channel;

    let (tx, rx) = channel();

    tauri::api::dialog::FileDialogBuilder::new()
        .set_file_name(&default_filename)
        .add_filter("Video Files", &["mp4"])
        .save_file(move |file_path| {
            if let Some(path) = file_path {
                tx.send(path.to_string_lossy().to_string()).ok();
            } else {
                tx.send(String::new()).ok();
            }
        });

    let path = rx.recv().map_err(|e| e.to_string())?;

    if path.is_empty() {
        Err("No file selected".to_string())
    } else {
        Ok(path)
    }
}
```

2. Register it:
```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            get_video_metadata,
            trim_video,
            save_file_dialog  // Add this
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### Step 3: Create Export Dialog Component (60 minutes)

**File to create:** `src/components/ExportDialog.tsx`

**What to do:**
1. Create `src/components/ExportDialog.tsx`:

```typescript
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  Alert
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { shell } from '@tauri-apps/api';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  inputPath: string;
  trimStart: number;
  trimEnd: number;
  videoName: string;
}

function ExportDialog({
  open,
  onClose,
  inputPath,
  trimStart,
  trimEnd,
  videoName
}: ExportDialogProps) {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  // Listen for FFmpeg progress events
  useEffect(() => {
    if (!open) return;

    const unlisten = listen<string>('export-progress', (event) => {
      const line = event.payload;

      // Parse FFmpeg time output
      // Example: "time=00:00:05.23"
      const match = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseFloat(match[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;

        const duration = trimEnd - trimStart;
        const progressPercent = Math.min(100, (currentTime / duration) * 100);
        setProgress(progressPercent);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [open, trimStart, trimEnd]);

  // Start export
  const handleExport = async () => {
    setStatus('exporting');
    setProgress(0);
    setError(null);

    try {
      // Prompt user for save location
      const defaultName = videoName.replace(/\.(mp4|mov)$/i, '_trimmed.mp4');
      const savePath = await invoke<string>('save_file_dialog', {
        defaultFilename: defaultName
      });

      if (!savePath) {
        setStatus('idle');
        return; // User cancelled
      }

      // Ensure .mp4 extension
      const outputPath = savePath.endsWith('.mp4') ? savePath : `${savePath}.mp4`;

      // Call Rust trim command
      const result = await invoke<string>('trim_video', {
        inputPath,
        outputPath,
        startTime: trimStart,
        endTime: trimEnd
      });

      setOutputPath(result);
      setStatus('success');
      setProgress(100);

    } catch (err: any) {
      console.error('Export failed:', err);
      setError(err.toString());
      setStatus('error');
    }
  };

  // Open output folder
  const openFolder = async () => {
    if (outputPath) {
      // Open folder containing the file
      const folderPath = outputPath.substring(0, outputPath.lastIndexOf('/'));
      await shell.open(folderPath);
    }
  };

  // Reset and close
  const handleClose = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setOutputPath(null);
    onClose();
  };

  // Auto-start export when dialog opens
  useEffect(() => {
    if (open && status === 'idle') {
      handleExport();
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={status === 'exporting' ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {status === 'exporting' && 'Exporting Video...'}
        {status === 'success' && 'Export Complete!'}
        {status === 'error' && 'Export Failed'}
        {status === 'idle' && 'Export Video'}
      </DialogTitle>

      <DialogContent>
        {status === 'exporting' && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Trimming video from {trimStart.toFixed(1)}s to {trimEnd.toFixed(1)}s
            </Typography>
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {progress.toFixed(0)}%
            </Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="body1" gutterBottom>
              Video exported successfully!
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {outputPath}
            </Typography>
          </Box>
        )}

        {status === 'error' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {status === 'success' && (
          <>
            <Button onClick={openFolder}>Open Folder</Button>
            <Button onClick={handleClose} variant="contained">Done</Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Button onClick={handleExport}>Retry</Button>
            <Button onClick={handleClose}>Close</Button>
          </>
        )}

        {status === 'exporting' && (
          <Typography variant="caption" color="text.secondary">
            Please wait...
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ExportDialog;
```

**Component features:**
- Auto-starts export when opened
- Shows progress bar with percentage
- Parses FFmpeg time output for accurate progress
- Shows success/error states
- "Open Folder" button to reveal exported file
- Prevents closing during export

---

### Step 4: Create Export Button Component (30 minutes)

**File to create:** `src/components/ExportButton.tsx`

**What to do:**
1. Create `src/components/ExportButton.tsx`:

```typescript
import { useState } from 'react';
import { Button } from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';
import ExportDialog from './ExportDialog';

function ExportButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    videoPath,
    videoName,
    videoDuration,
    trimStart,
    trimEnd
  } = useVideoStore();

  // Can't export if no video or trim duration is zero
  const canExport = videoPath && videoDuration && (trimEnd - trimStart) > 0;

  const handleClick = () => {
    if (canExport) {
      setDialogOpen(true);
    }
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={<FileDownload />}
        onClick={handleClick}
        disabled={!canExport}
      >
        Export
      </Button>

      {videoPath && videoName && (
        <ExportDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          inputPath={videoPath}
          trimStart={trimStart}
          trimEnd={trimEnd}
          videoName={videoName}
        />
      )}
    </>
  );
}

export default ExportButton;
```

**Features:**
- Disabled when no video loaded
- Opens export dialog on click
- Passes trim points to dialog

---

### Step 5: Update Editor Layout with Export Button (15 minutes)

**File to edit:** `src/components/EditorLayout.tsx`

**What to do:**
1. Import the ExportButton:
```typescript
import ExportButton from './ExportButton';
```

2. Replace the static Export button:

```typescript
{/* Before */}
<Button color="inherit" startIcon={<FileDownload />}>
  Export
</Button>

{/* After */}
<ExportButton />
```

---

### Step 6: Add Shell API Permission (10 minutes)

**File to edit:** `src-tauri/tauri.conf.json`

**What to do:**
1. Add shell open permission to allowlist:

```json
{
  "tauri": {
    "allowlist": {
      "shell": {
        "open": true
      },
      "protocol": {
        "asset": true,
        "assetScope": ["**"]
      }
    }
  }
}
```

**Why needed:**
- Allows `shell.open()` to open file explorer
- Used by "Open Folder" button

---

### Step 7: Test Export Functionality (30 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test basic export:**
   - Import a video
   - Set trim points using timeline
   - Click "Export" button
   - Choose save location
   - Verify progress dialog appears
   - Watch progress bar fill
   - Verify "Export Complete" appears

3. **Test exported file:**
   - Click "Open Folder"
   - Verify file exists
   - Play exported video in QuickTime/VLC
   - Verify it starts at trim start time
   - Verify it ends at trim end time
   - Verify quality is preserved

4. **Test error handling:**
   - Try exporting to an invalid location (if possible)
   - Verify error dialog appears
   - Click "Retry" to try again

5. **Test cancellation:**
   - Start export
   - Try closing dialog during export
   - Should not close (prevents data corruption)

**Expected console output:**
```
Export started: /path/to/output.mp4
FFmpeg progress: time=00:00:02.50
FFmpeg progress: time=00:00:05.00
Export complete: /path/to/output.mp4
```

---

## Success Criteria

- [ ] Export button is enabled when video loaded
- [ ] Clicking Export opens save dialog
- [ ] Export dialog shows progress bar
- [ ] Progress updates in real-time
- [ ] Exported file plays correctly
- [ ] Trim points are accurate in output
- [ ] "Open Folder" button works
- [ ] Error messages display on failure
- [ ] Dialog can't be closed during export
- [ ] Retry button works after error

---

## Common Issues & Solutions

### Issue: FFmpeg not found
**Solution**:
- Install FFmpeg: `brew install ffmpeg` (macOS) or download from ffmpeg.org (Windows)
- Add to PATH if not already

### Issue: Progress not updating
**Solution**:
- FFmpeg writes progress to stderr
- Check that `stderr(Stdio::piped())` is set
- Verify event listener is attached

### Issue: Export takes a long time
**Solution**:
- Using `-c copy` should be fast (no re-encoding)
- If slow, check if codec is compatible
- Some formats may require re-encoding (remove `-c copy`)

### Issue: Exported video won't play
**Solution**:
- Try without `-c copy` to force re-encode
- Some trim points may not align with keyframes
- Add `-avoid_negative_ts make_zero` (already included)

### Issue: "Open Folder" doesn't work
**Solution**:
- Verify `shell.open` is in allowlist
- Check Tauri permissions in `tauri.conf.json`

---

## Optional Enhancements (Post-MVP)

- Export presets (quality settings, resolution, format)
- Custom codec selection (H.264, H.265, VP9)
- Batch export multiple trim ranges
- Background export (non-blocking)
- Export queue system
- Custom bitrate/resolution settings
- Audio normalization
- Watermark overlay

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-06: Screen Recording** for native screen capture
2. Core editing workflow is now complete
3. Focus shifts to recording features

---

## Files Created/Modified

- ✅ `src/components/ExportDialog.tsx` (new)
- ✅ `src/components/ExportButton.tsx` (new)
- ✅ `src/components/EditorLayout.tsx` (modified)
- ✅ `src-tauri/src/main.rs` (modified - added 2 commands)
- ✅ `src-tauri/tauri.conf.json` (modified - shell permission)
