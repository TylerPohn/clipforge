# PRD: Video Import

**Feature**: Import Video Files via Drag-and-Drop or File Picker
**Priority**: P0 (Blocker)
**Estimated Time**: 4-5 hours
**Dependencies**: PRD-01 (App Launch & Setup)

---

## Overview

Allow users to import video files (MP4, MOV) into ClipForge using either drag-and-drop or a file picker dialog. Once imported, display video metadata and prepare the file for editing.

---

## Goals

- Support drag-and-drop of video files onto the app window
- Provide a file picker button for traditional file selection
- Validate file types (MP4, MOV only)
- Extract and display video metadata (duration, resolution, codec)
- Load video into the player for preview
- Handle invalid files gracefully with error messages

---

## Implementation Steps

### Step 1: Set Up State Management (45 minutes)

**File to create:** `src/store/videoStore.ts`

**What to do:**
1. DONE Install Zustand for state management:
   ```bash
   npm install zustand
   ```

2. Create `src/store/` folder
3. Create `src/store/videoStore.ts` with this code:

```typescript
import { create } from 'zustand';

interface VideoState {
  // Video file information
  videoPath: string | null;
  videoName: string | null;
  videoDuration: number | null;  // in seconds
  videoResolution: { width: number; height: number } | null;

  // Trim points (will be used later)
  trimStart: number;
  trimEnd: number;

  // Methods to update state
  setVideo: (path: string, name: string) => void;
  setMetadata: (duration: number, resolution: { width: number; height: number }) => void;
  setTrimPoints: (start: number, end: number) => void;
  clearVideo: () => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  // Initial state
  videoPath: null,
  videoName: null,
  videoDuration: null,
  videoResolution: null,
  trimStart: 0,
  trimEnd: 0,

  // Actions
  setVideo: (path, name) => set({
    videoPath: path,
    videoName: name
  }),

  setMetadata: (duration, resolution) => set({
    videoDuration: duration,
    videoResolution: resolution,
    trimStart: 0,
    trimEnd: duration
  }),

  setTrimPoints: (start, end) => set({
    trimStart: start,
    trimEnd: end
  }),

  clearVideo: () => set({
    videoPath: null,
    videoName: null,
    videoDuration: null,
    videoResolution: null,
    trimStart: 0,
    trimEnd: 0
  }),
}));
```

**Why Zustand:**
- Simpler than Redux
- No context provider needed
- Easy to use across components
- TypeScript support

---

### Step 2: Create Tauri Command for File Dialog (30 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Open `src-tauri/src/main.rs`
2. Add this import at the top:
```rust
use tauri::api::dialog::FileDialogBuilder;
```

3. Add this command before `fn main()`:

```rust
#[tauri::command]
fn open_file_dialog(window: tauri::Window) -> Result<String, String> {
    use std::sync::mpsc::channel;

    let (tx, rx) = channel();

    FileDialogBuilder::new()
        .add_filter("Video Files", &["mp4", "mov"])
        .pick_file(move |file_path| {
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

4. Register the command in `fn main()`:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog  // Add this line
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**What this does:**
- Opens native file picker dialog
- Filters to only show MP4 and MOV files
- Returns the selected file path to the frontend

---

### Step 3: Create Import Button Component (45 minutes)

**File to create:** `src/components/ImportButton.tsx`

**What to do:**
1. Create `src/components/ImportButton.tsx`:

```typescript
import { useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import { VideoFile } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/tauri';
import { useVideoStore } from '../store/videoStore';

function ImportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setVideo = useVideoStore((state) => state.setVideo);

  const handleImport = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call Tauri command to open file dialog
      const filePath = await invoke<string>('open_file_dialog');

      // Extract filename from path
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

      // Validate file extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext !== 'mp4' && ext !== 'mov') {
        throw new Error('Please select an MP4 or MOV file');
      }

      // Update store with video info
      setVideo(filePath, fileName);

      console.log('Video imported:', filePath);

    } catch (err: any) {
      console.error('Import error:', err);
      if (err !== 'No file selected') {
        setError(err.toString());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <VideoFile />}
        onClick={handleImport}
        disabled={loading}
        sx={{ mr: 2 }}
      >
        Import
      </Button>

      {/* Error notification */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

export default ImportButton;
```

**Component breakdown:**
- Uses `invoke` to call Rust command
- Shows loading spinner while opening dialog
- Validates file extension on frontend
- Displays error messages via Snackbar
- Updates global state when file is selected

---

### Step 4: Add Drag-and-Drop Support (60 minutes)

**File to create:** `src/components/DropZone.tsx`

**What to do:**
1. First, enable file drop in Tauri config.

   **Edit:** `src-tauri/tauri.conf.json`

   Find the `windows` section and add `fileDropEnabled`:

```json
{
  "windows": [
    {
      "title": "ClipForge",
      "width": 1280,
      "height": 800,
      "fileDropEnabled": true
    }
  ]
}
```

2. Create `src/components/DropZone.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { listen } from '@tauri-apps/api/event';
import { useVideoStore } from '../store/videoStore';

interface DropZoneProps {
  children?: React.ReactNode;
}

function DropZone({ children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const setVideo = useVideoStore((state) => state.setVideo);
  const videoPath = useVideoStore((state) => state.videoPath);

  useEffect(() => {
    // Listen for file drop events from Tauri
    const unlisten = listen<string[]>('tauri://file-drop', (event) => {
      const files = event.payload;

      if (files && files.length > 0) {
        const filePath = files[0]; // Take first file
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

        // Validate extension
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'mp4' || ext === 'mov') {
          setVideo(filePath, fileName);
          console.log('File dropped:', filePath);
        } else {
          alert('Please drop an MP4 or MOV file');
        }
      }

      setIsDragging(false);
    });

    // Listen for drag hover events
    const unlistenHover = listen('tauri://file-drop-hover', () => {
      setIsDragging(true);
    });

    // Listen for drag cancelled
    const unlistenCancelled = listen('tauri://file-drop-cancelled', () => {
      setIsDragging(false);
    });

    // Cleanup listeners on unmount
    return () => {
      unlisten.then((fn) => fn());
      unlistenHover.then((fn) => fn());
      unlistenCancelled.then((fn) => fn());
    };
  }, [setVideo]);

  // Show drop zone only when no video is loaded
  if (videoPath) {
    return <>{children}</>;
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
      }}
    >
      <Paper
        elevation={isDragging ? 8 : 2}
        sx={{
          p: 6,
          textAlign: 'center',
          backgroundColor: isDragging ? 'primary.dark' : 'background.paper',
          border: `2px dashed ${isDragging ? '#00bcd4' : 'rgba(255, 255, 255, 0.23)'}`,
          transition: 'all 0.3s ease',
          minWidth: 400,
        }}
      >
        <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          {isDragging ? 'Drop video here' : 'Import a video'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Drag and drop an MP4 or MOV file, or use the Import button
        </Typography>
      </Paper>
    </Box>
  );
}

export default DropZone;
```

**How this works:**
- Listens to Tauri's file-drop events
- Shows visual feedback when dragging file over window
- Validates file type before accepting
- Updates store when valid file is dropped
- Hides itself when video is loaded

---

### Step 5: Create Metadata Extraction with FFprobe (60 minutes)

**File to edit:** `src-tauri/src/main.rs`

**What to do:**
1. Add a new command to extract video metadata using FFprobe:

```rust
#[tauri::command]
fn get_video_metadata(video_path: String) -> Result<String, String> {
    use std::process::Command;

    // Run ffprobe to get video metadata as JSON
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &video_path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFprobe error: {}", error));
    }

    let json = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(json)
}
```

2. Register the command:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            get_video_metadata  // Add this
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**What FFprobe does:**
- Extracts video duration, resolution, codec, bitrate
- Returns data as JSON for easy parsing
- Ships with FFmpeg (no separate install needed)

---

### Step 6: Parse Metadata in Frontend (45 minutes)

**File to create:** `src/hooks/useVideoMetadata.ts`

**What to do:**
1. Create `src/hooks/` folder
2. Create `src/hooks/useVideoMetadata.ts`:

```typescript
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useVideoStore } from '../store/videoStore';

export function useVideoMetadata() {
  const videoPath = useVideoStore((state) => state.videoPath);
  const setMetadata = useVideoStore((state) => state.setMetadata);

  useEffect(() => {
    if (!videoPath) return;

    const fetchMetadata = async () => {
      try {
        const metadataJson = await invoke<string>('get_video_metadata', {
          videoPath
        });

        const metadata = JSON.parse(metadataJson);

        // Extract video stream (usually first video stream)
        const videoStream = metadata.streams.find(
          (s: any) => s.codec_type === 'video'
        );

        if (!videoStream) {
          throw new Error('No video stream found');
        }

        // Parse duration
        const duration = parseFloat(metadata.format.duration);

        // Parse resolution
        const resolution = {
          width: videoStream.width,
          height: videoStream.height
        };

        // Update store
        setMetadata(duration, resolution);

        console.log('Metadata loaded:', { duration, resolution });

      } catch (error) {
        console.error('Failed to load metadata:', error);
      }
    };

    fetchMetadata();
  }, [videoPath, setMetadata]);
}
```

**Hook usage:**
- Automatically runs when `videoPath` changes
- Calls Rust command to get metadata
- Parses JSON response
- Updates store with duration and resolution

---

### Step 7: Update Editor Layout with Import Components (30 minutes)

**File to edit:** `src/components/EditorLayout.tsx`

**What to do:**
1. Replace the file with this updated version:

```typescript
import { AppBar, Toolbar, Typography, Box, Chip } from '@mui/material';
import { FiberManualRecord, FileDownload } from '@mui/icons-material';
import ImportButton from './ImportButton';
import DropZone from './DropZone';
import { useVideoStore } from '../store/videoStore';
import { useVideoMetadata } from '../hooks/useVideoMetadata';

function EditorLayout() {
  // Load metadata when video is imported
  useVideoMetadata();

  const { videoName, videoDuration, videoResolution } = useVideoStore();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          <ImportButton />

          <Button color="inherit" startIcon={<FiberManualRecord />} sx={{ mr: 2 }}>
            Record
          </Button>

          <Button color="inherit" startIcon={<FileDownload />}>
            Export
          </Button>
        </Toolbar>
      </AppBar>

      {/* Video info chips */}
      {videoName && (
        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <Chip label={videoName} color="primary" />
          {videoDuration && (
            <Chip label={`${videoDuration.toFixed(1)}s`} />
          )}
          {videoResolution && (
            <Chip label={`${videoResolution.width}x${videoResolution.height}`} />
          )}
        </Box>
      )}

      {/* Main Content Area with Drop Zone */}
      <DropZone>
        <Box sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Typography variant="h5" color="text.secondary">
            Video player will appear here
          </Typography>
        </Box>
      </DropZone>

      {/* Timeline Footer */}
      <Box sx={{
        height: 120,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        p: 2,
      }}>
        <Typography variant="body2" color="text.secondary">
          Timeline will appear here
        </Typography>
      </Box>
    </Box>
  );
}

export default EditorLayout;
```

**Changes made:**
- Replaced static Import button with `ImportButton` component
- Added `DropZone` wrapper
- Added `useVideoMetadata` hook
- Display video info chips when video is loaded

---

### Step 8: Test Import Functionality (20 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test file picker:**
   - Click "Import" button
   - Select an MP4 or MOV file
   - Verify metadata chips appear at top

3. **Test drag-and-drop:**
   - Drag an MP4 file from your file system
   - Drop it onto the app window
   - Verify drop zone highlights on hover
   - Verify metadata loads after drop

4. **Test error handling:**
   - Try dragging a non-video file (e.g., .txt)
   - Should see error message
   - Try clicking Import and cancelling
   - Should not crash

**Expected console output:**
```
Video imported: /path/to/video.mp4
Metadata loaded: { duration: 15.5, resolution: { width: 1920, height: 1080 } }
```

---

## Success Criteria

- [ ] Import button opens native file dialog
- [ ] File dialog filters to MP4/MOV files only
- [ ] Drag-and-drop accepts video files
- [ ] Drop zone shows visual feedback during drag
- [ ] Metadata (duration, resolution) displays after import
- [ ] Invalid file types show error message
- [ ] Video name displays in a chip
- [ ] No errors in console

---

## Common Issues & Solutions

### Issue: "FFprobe not found"
**Solution**: Install FFmpeg:
- **macOS**: `brew install ffmpeg`
- **Windows**: Download from ffmpeg.org and add to PATH

### Issue: File drop not working
**Solution**: Verify `fileDropEnabled: true` in `tauri.conf.json`

### Issue: Metadata not loading
**Solution**: Check console for FFprobe errors, verify video file is valid

### Issue: Import button does nothing
**Solution**: Check Rust console for errors, verify `open_file_dialog` is registered

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-03: Preview Player** to add video playback
2. The video path in store will be used to load the video element
3. Metadata will be used to set timeline duration

---

## Files Created/Modified

- ✅ `src/store/videoStore.ts` (new)
- ✅ `src/components/ImportButton.tsx` (new)
- ✅ `src/components/DropZone.tsx` (new)
- ✅ `src/hooks/useVideoMetadata.ts` (new)
- ✅ `src/components/EditorLayout.tsx` (modified)
- ✅ `src-tauri/src/main.rs` (modified - added 2 commands)
- ✅ `src-tauri/tauri.conf.json` (modified)
