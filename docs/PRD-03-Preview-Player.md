# PRD: Preview Player

**Feature**: Video Playback with Play/Pause Controls
**Priority**: P0 (Blocker)
**Estimated Time**: 3-4 hours
**Dependencies**: PRD-02 (Video Import)

---

## Overview

Implement a video player that displays the imported video with standard playback controls (play, pause, seek, volume). The player should respect trim points set in the timeline (implemented in later PRD).

---

## Goals

- Display imported video in a styled player component
- Implement play/pause functionality
- Add seek bar for scrubbing through video
- Show current time and total duration
- Support keyboard shortcuts (Space = play/pause, Arrow keys = seek)
- Handle video loading states and errors

---

## Implementation Steps

### Step 1: Create Tauri Command to Load Video Files (45 minutes)

**Background:**
HTML `<video>` elements can't directly access file system paths for security reasons. We create a Tauri command that reads the video file and returns it as bytes, which we then convert to a Blob URL in the browser.

**File to edit:** `src-tauri/src/lib.rs`

**What to do:**
1. Add this command to read video files:

```rust
#[tauri::command]
fn get_video_file(video_path: &str) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(video_path)
        .map_err(|e| format!("Failed to read video file: {}", e))
}
```

2. Register it in the builder:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_file_dialog,
            get_video_metadata,
            get_video_file  // Add this
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Why this approach:**
- Reads the entire video file from disk and sends bytes to frontend
- Frontend converts bytes to Blob, then creates blob:// URL
- Blob URLs bypass security restrictions and work with HTML5 video elements
- Works reliably across all platforms and video codecs

---

### Step 2: Update Video Store with Playback State (30 minutes)

**File to edit:** `src/store/videoStore.ts`

**What to do:**
1. Add playback state to the interface and store:

```typescript
import { create } from 'zustand';

interface VideoState {
  // Video file information
  videoPath: string | null;
  videoName: string | null;
  videoDuration: number | null;
  videoResolution: { width: number; height: number } | null;

  // Trim points
  trimStart: number;
  trimEnd: number;

  // Playback state (NEW)
  isPlaying: boolean;
  currentTime: number;
  volume: number;

  // Methods
  setVideo: (path: string, name: string) => void;
  setMetadata: (duration: number, resolution: { width: number; height: number }) => void;
  setTrimPoints: (start: number, end: number) => void;
  clearVideo: () => void;

  // Playback methods (NEW)
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setVolume: (volume: number) => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  // Existing state
  videoPath: null,
  videoName: null,
  videoDuration: null,
  videoResolution: null,
  trimStart: 0,
  trimEnd: 0,

  // New playback state
  isPlaying: false,
  currentTime: 0,
  volume: 1.0,

  // Existing actions
  setVideo: (path, name) => set({
    videoPath: path,
    videoName: name,
    isPlaying: false,
    currentTime: 0
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
    trimEnd: 0,
    isPlaying: false,
    currentTime: 0
  }),

  // New playback actions
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setVolume: (volume) => set({ volume: volume }),
}));
```

---

### Step 3: Create Video Player Component (90 minutes)

**File to create:** `src/components/VideoPlayer.tsx`

**What to do:**
1. Create `src/components/VideoPlayer.tsx`:

```typescript
import { useRef, useEffect, useState } from 'react';
import { Box, IconButton, Slider, Typography, Stack } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff
} from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const {
    videoPath,
    isPlaying,
    currentTime,
    volume,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setVolume
  } = useVideoStore();

  // Fetch video file and create blob URL
  useEffect(() => {
    if (!videoPath) {
      setVideoSrc(null);
      return;
    }

    const loadVideo = async () => {
      try {
        if (!window.__TAURI_INVOKE__) {
          console.error('Tauri invoke not available');
          return;
        }

        const invoke = window.__TAURI_INVOKE__;
        const videoBytes = (await invoke('get_video_file', {
          videoPath: videoPath
        })) as number[];

        const uint8Array = new Uint8Array(videoBytes);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        setVideoSrc(blobUrl);
      } catch (e) {
        console.error('Failed to load video file:', e);
      }
    };

    loadVideo();
  }, [videoPath]);

  // Sync video element with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(err => {
        console.error('Play failed:', err);
        setPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, setPlaying]);

  // Update video time when store changes (for seeking)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only update if difference is significant (avoid feedback loop)
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  // Update volume when store changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    // Auto-pause at trim end point
    if (trimEnd && video.currentTime >= trimEnd) {
      video.pause();
      setPlaying(false);
      video.currentTime = trimEnd;
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    setPlaying(!isPlaying);
  };

  // Handle seek
  const handleSeek = (_: Event, value: number | number[]) => {
    const newTime = Array.isArray(value) ? value[0] : value;
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!videoSrc) {
    return null; // No video loaded
  }

  return (
    <Box sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      position: 'relative'
    }}>
      {/* Video Element */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <video
          ref={videoRef}
          src={videoSrc}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
        />

        {/* Play/Pause Overlay (shows when paused) */}
        {!isPlaying && (
          <Box
            onClick={togglePlayPause}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(0,0,0,0.3)',
              transition: 'background-color 0.2s'
            }}
          >
            <PlayArrow sx={{ fontSize: 80, color: 'white' }} />
          </Box>
        )}
      </Box>

      {/* Controls Bar */}
      <Box sx={{
        height: 80,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        px: 3,
        py: 2
      }}>
        {/* Seek Slider */}
        <Slider
          value={currentTime}
          min={0}
          max={videoDuration || 100}
          onChange={handleSeek}
          size="small"
          sx={{ mb: 1 }}
        />

        {/* Control Buttons */}
        <Stack direction="row" alignItems="center" spacing={2}>
          {/* Play/Pause */}
          <IconButton onClick={togglePlayPause} color="primary">
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>

          {/* Time Display */}
          <Typography variant="body2" sx={{ minWidth: 100 }}>
            {formatTime(currentTime)} / {formatTime(videoDuration || 0)}
          </Typography>

          <Box sx={{ flex: 1 }} />

          {/* Volume */}
          <IconButton onClick={toggleMute} size="small">
            {volume > 0 ? <VolumeUp /> : <VolumeOff />}
          </IconButton>
          <Slider
            value={volume}
            min={0}
            max={1}
            step={0.1}
            onChange={(_, val) => setVolume(Array.isArray(val) ? val[0] : val)}
            sx={{ width: 100 }}
            size="small"
          />
        </Stack>
      </Box>
    </Box>
  );
}

export default VideoPlayer;
```

**Component breakdown:**
- **Video element**: Displays the video with file URL from Tauri
- **Play/Pause overlay**: Big play button when paused
- **Seek slider**: Scrub through video timeline
- **Control buttons**: Play/pause, volume
- **Time display**: Current time / total duration
- **Auto-pause**: Stops at trim end point (for later trimming feature)

---

### Step 4: Add Keyboard Shortcuts (30 minutes)

**File to create:** `src/hooks/useKeyboardShortcuts.ts`

**What to do:**
1. Create `src/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useEffect } from 'react';
import { useVideoStore } from '../store/videoStore';

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    currentTime,
    videoDuration,
    setPlaying,
    setCurrentTime
  } = useVideoStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          // Go back 5 seconds
          setCurrentTime(Math.max(0, currentTime - 5));
          break;

        case 'ArrowRight':
          e.preventDefault();
          // Go forward 5 seconds
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 5));
          break;

        case 'KeyJ':
          e.preventDefault();
          // Go back 1 frame (assume 30fps = 0.033s)
          setCurrentTime(Math.max(0, currentTime - 0.033));
          break;

        case 'KeyK':
          e.preventDefault();
          // Toggle play/pause
          setPlaying(!isPlaying);
          break;

        case 'KeyL':
          e.preventDefault();
          // Go forward 1 frame
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 0.033));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, videoDuration, setPlaying, setCurrentTime]);
}
```

**Keyboard shortcuts:**
- `Space` or `K` - Play/Pause
- `←` - Back 5 seconds
- `→` - Forward 5 seconds
- `J` - Back 1 frame
- `L` - Forward 1 frame

---

### Step 5: Update Editor Layout with Video Player (20 minutes)

**File to edit:** `src/components/EditorLayout.tsx`

**What to do:**
1. Import the player and hook:
```typescript
import VideoPlayer from './VideoPlayer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
```

2. Add hook call at top of component:
```typescript
function EditorLayout() {
  useVideoMetadata();
  useKeyboardShortcuts(); // Add this

  // ... rest of component
}
```

3. Replace the main content area (the DropZone section):

```typescript
{/* Main Content Area with Drop Zone */}
<DropZone>
  <VideoPlayer />
</DropZone>
```

**Complete updated component:**

```typescript
import { AppBar, Toolbar, Typography, Box, Chip, Button } from '@mui/material';
import { FiberManualRecord, FileDownload } from '@mui/icons-material';
import ImportButton from './ImportButton';
import DropZone from './DropZone';
import VideoPlayer from './VideoPlayer';
import { useVideoStore } from '../store/videoStore';
import { useVideoMetadata } from '../hooks/useVideoMetadata';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function EditorLayout() {
  useVideoMetadata();
  useKeyboardShortcuts();

  const { videoName, videoDuration, videoResolution } = useVideoStore();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {videoName && (
        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <Chip label={videoName} color="primary" />
          {videoDuration && <Chip label={`${videoDuration.toFixed(1)}s`} />}
          {videoResolution && (
            <Chip label={`${videoResolution.width}x${videoResolution.height}`} />
          )}
        </Box>
      )}

      <DropZone>
        <VideoPlayer />
      </DropZone>

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

---

### Step 6: Configure Tauri Asset Protocol (15 minutes)

**File to edit:** `src-tauri/tauri.conf.json`

**What to do:**
1. Add asset protocol scope to allow wide file access:

```json
{
  "app": {
    "security": {
      "csp": null,
      "assetProtocol": {
        "scope": ["**"]
      }
    }
  }
}
```

**What this does:**
- Configures Tauri's asset protocol with a broad scope
- `"**"` allows access to any file on the system
- This is needed because users can import videos from anywhere on their system

**Note:** In production apps, you may want to restrict this to specific directories like `["$HOME/Downloads/**", "$HOME/Videos/**"]`

---

### Step 7: Test Video Player (20 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test basic playback:**
   - Import a video
   - Click the big play button or press Space
   - Video should start playing
   - Controls should appear at bottom

3. **Test controls:**
   - Click pause button
   - Drag seek slider
   - Adjust volume slider
   - Click mute button

4. **Test keyboard shortcuts:**
   - Press `Space` to play/pause
   - Press `←` and `→` to seek
   - Press `J` and `L` to step frame-by-frame
   - Press `K` to play/pause

5. **Test edge cases:**
   - Seek to end of video
   - Should auto-pause when video ends
   - Mute and unmute
   - Pause, seek, then play from new position

**Expected behavior:**
- Video plays smoothly
- Controls respond immediately
- Time display updates every second
- Keyboard shortcuts work
- Volume changes apply in real-time

---

## Success Criteria

- [ ] Video displays after import
- [ ] Play/pause button works
- [ ] Big play overlay appears when paused
- [ ] Seek slider updates as video plays
- [ ] Dragging seek slider jumps to new time
- [ ] Volume slider controls audio level
- [ ] Mute button toggles sound
- [ ] Time display shows current/total time
- [ ] Space key toggles play/pause
- [ ] Arrow keys seek 5 seconds
- [ ] J/K/L keys work for frame stepping
- [ ] Video auto-pauses at end

---

## Common Issues & Solutions

### Issue: Video doesn't load/show black screen
**Solution**:
- Check browser console for errors
- Verify `assetScope` in `tauri.conf.json`
- Try a different video file (some codecs may not be supported)

### Issue: Keyboard shortcuts don't work
**Solution**:
- Click on the window to focus it
- Check console for event listener errors
- Verify `useKeyboardShortcuts` hook is called in EditorLayout

### Issue: Seek is laggy or jumpy
**Solution**:
- This is normal for some video codecs
- H.264 videos seek better than others
- Use `video.currentTime` setter (already implemented)

### Issue: Controls don't update
**Solution**:
- Verify store subscriptions in VideoPlayer
- Check that `onTimeUpdate` event is firing
- Look for React re-render issues in console

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-04: Timeline View & Trim** to add trim handles
2. The player will respect `trimStart` and `trimEnd` points
3. Timeline will provide visual representation of trim points

---

## Files Created/Modified

- ✅ `src/components/VideoPlayer.tsx` (new)
- ✅ `src/hooks/useKeyboardShortcuts.ts` (new)
- ✅ `src/store/videoStore.ts` (modified - added playback state)
- ✅ `src/components/EditorLayout.tsx` (modified - added player)
- ✅ `src-tauri/tauri.conf.json` (modified - asset protocol)
- ✅ `src-tauri/src/main.rs` (modified - optional convert command)
