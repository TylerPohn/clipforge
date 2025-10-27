# PRD: Timeline View & Trim

**Feature**: Visual Timeline with Trim Handles
**Priority**: P0 (Blocker)
**Estimated Time**: 4-5 hours
**Dependencies**: PRD-03 (Preview Player)

---

## Overview

Create a visual timeline that represents the video duration and allows users to set trim points (in/out points) using draggable handles. The timeline should sync with the video player and provide precise control over which portion of the video to export.

---

## Goals

- Display a horizontal timeline representing full video duration
- Show trim handles (start and end) that can be dragged
- Highlight the selected/trimmed region
- Display time markers and ruler
- Sync timeline position with video playback
- Allow clicking on timeline to seek video
- Show thumbnail preview on hover (stretch goal - skip for MVP)

---

## Implementation Steps

### Step 1: Create Timeline Component Structure (45 minutes)

**File to create:** `src/components/Timeline.tsx`

**What to do:**
1. Create `src/components/Timeline.tsx`:

```typescript
import { Box, Slider, Typography, Stack, IconButton } from '@mui/material';
import { ContentCut } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

function Timeline() {
  const {
    videoDuration,
    currentTime,
    trimStart,
    trimEnd,
    setCurrentTime,
    setTrimPoints
  } = useVideoStore();

  // If no video loaded, show placeholder
  if (!videoDuration) {
    return (
      <Box sx={{
        height: 120,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}>
        <Typography variant="body2" color="text.secondary">
          Timeline will appear here
        </Typography>
      </Box>
    );
  }

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle trim range change
  const handleTrimChange = (_: Event, newValue: number | number[]) => {
    if (Array.isArray(newValue)) {
      setTrimPoints(newValue[0], newValue[1]);
    }
  };

  // Handle playhead seek
  const handleSeek = (_: Event, value: number | number[]) => {
    const newTime = Array.isArray(value) ? value[0] : value;
    setCurrentTime(newTime);
  };

  // Reset trim to full video
  const resetTrim = () => {
    setTrimPoints(0, videoDuration);
  };

  return (
    <Box sx={{
      height: 140,
      backgroundColor: 'background.paper',
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" color="text.secondary">
          Timeline
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Trim: {formatTime(trimStart)} - {formatTime(trimEnd)}
          </Typography>
          <IconButton size="small" onClick={resetTrim} title="Reset trim">
            <ContentCut fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Trim Range Slider */}
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Trim Range
        </Typography>
        <Slider
          value={[trimStart, trimEnd]}
          onChange={handleTrimChange}
          min={0}
          max={videoDuration}
          step={0.1}
          valueLabelDisplay="auto"
          valueLabelFormat={formatTime}
          sx={{
            '& .MuiSlider-track': {
              backgroundColor: 'primary.main',
              height: 8
            },
            '& .MuiSlider-rail': {
              backgroundColor: 'rgba(255,255,255,0.2)',
              height: 8
            },
            '& .MuiSlider-thumb': {
              width: 16,
              height: 16,
              '&:hover, &.Mui-focusVisible': {
                boxShadow: '0 0 0 8px rgba(0, 188, 212, 0.16)'
              }
            }
          }}
        />
      </Box>

      {/* Playhead Slider */}
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Playhead
        </Typography>
        <Slider
          value={currentTime}
          onChange={handleSeek}
          min={0}
          max={videoDuration}
          step={0.01}
          valueLabelDisplay="auto"
          valueLabelFormat={formatTime}
          sx={{
            '& .MuiSlider-thumb': {
              width: 12,
              height: 12,
              backgroundColor: 'secondary.main'
            },
            '& .MuiSlider-track': {
              height: 4,
              backgroundColor: 'secondary.main'
            },
            '& .MuiSlider-rail': {
              height: 4
            }
          }}
        />
      </Box>
    </Box>
  );
}

export default Timeline;
```

**Component breakdown:**
- **Trim Range Slider**: Two-handle slider (range) for start/end points
- **Playhead Slider**: Single handle showing current playback position
- **Reset button**: Returns trim to full video length
- **Time labels**: Show trim start/end times

---

### Step 2: Add Visual Trim Indicators (60 minutes)

**File to create:** `src/components/TimelineRuler.tsx`

**What to do:**
1. Create a more advanced timeline with visual ruler and trim zones:

```typescript
import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Stack, IconButton } from '@mui/material';
import { ContentCut, ZoomIn, ZoomOut } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null);
  const [zoom, setZoom] = useState(1);

  const {
    videoDuration,
    currentTime,
    trimStart,
    trimEnd,
    setCurrentTime,
    setTrimPoints
  } = useVideoStore();

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Draw timeline on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoDuration) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate pixel positions
    const trimStartX = (trimStart / videoDuration) * width;
    const trimEndX = (trimEnd / videoDuration) * width;
    const playheadX = (currentTime / videoDuration) * width;

    // Draw background (non-trimmed regions)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, width, height);

    // Draw trimmed region (highlighted)
    ctx.fillStyle = 'rgba(0, 188, 212, 0.2)';
    ctx.fillRect(trimStartX, 0, trimEndX - trimStartX, height);

    // Draw trim start handle
    ctx.fillStyle = '#00bcd4';
    ctx.fillRect(trimStartX - 2, 0, 4, height);

    // Draw trim end handle
    ctx.fillStyle = '#00bcd4';
    ctx.fillRect(trimEndX - 2, 0, 4, height);

    // Draw playhead
    ctx.fillStyle = '#ff4081';
    ctx.fillRect(playheadX - 1, 0, 2, height);

    // Draw time markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';

    const markerInterval = Math.ceil(videoDuration / 10); // ~10 markers
    for (let i = 0; i <= videoDuration; i += markerInterval) {
      const x = (i / videoDuration) * width;
      ctx.fillRect(x, height - 10, 1, 10);
      ctx.fillText(formatTime(i), x + 2, height - 15);
    }

  }, [videoDuration, trimStart, trimEnd, currentTime, zoom]);

  // Handle mouse down (start dragging)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = (x / rect.width) * videoDuration;

    // Determine what user clicked on
    const threshold = 10; // pixels

    const trimStartX = (trimStart / videoDuration) * rect.width;
    const trimEndX = (trimEnd / videoDuration) * rect.width;
    const playheadX = (currentTime / videoDuration) * rect.width;

    if (Math.abs(x - trimStartX) < threshold) {
      setIsDragging('start');
    } else if (Math.abs(x - trimEndX) < threshold) {
      setIsDragging('end');
    } else if (Math.abs(x - playheadX) < threshold) {
      setIsDragging('playhead');
    } else {
      // Click on timeline = seek
      setCurrentTime(timeAtX);
    }
  };

  // Handle mouse move (dragging)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = Math.max(0, Math.min(videoDuration, (x / rect.width) * videoDuration));

    if (isDragging === 'start') {
      setTrimPoints(Math.min(timeAtX, trimEnd - 0.5), trimEnd);
    } else if (isDragging === 'end') {
      setTrimPoints(trimStart, Math.max(timeAtX, trimStart + 0.5));
    } else if (isDragging === 'playhead') {
      setCurrentTime(timeAtX);
    }
  };

  // Handle mouse up (stop dragging)
  const handleMouseUp = () => {
    setIsDragging(null);
  };

  // Reset trim
  const resetTrim = () => {
    if (videoDuration) {
      setTrimPoints(0, videoDuration);
    }
  };

  if (!videoDuration) {
    return (
      <Box sx={{
        height: 140,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Typography variant="body2" color="text.secondary">
          Timeline will appear here
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: 140,
      backgroundColor: 'background.paper',
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      p: 2
    }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Timeline
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {formatTime(trimStart)} → {formatTime(trimEnd)} ({formatTime(trimEnd - trimStart)})
          </Typography>
          <IconButton size="small" onClick={resetTrim} title="Reset trim">
            <ContentCut fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Canvas Timeline */}
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        sx={{
          position: 'relative',
          height: 80,
          cursor: isDragging ? 'grabbing' : 'pointer',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 1,
          overflow: 'hidden'
        }}
      >
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || 800}
          height={80}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </Box>
    </Box>
  );
}

export default TimelineRuler;
```

**Features:**
- Canvas-based rendering for performance
- Visual trim region highlighting
- Draggable trim handles
- Draggable playhead
- Click to seek
- Time markers with labels
- Shows duration of trimmed region

---

### Step 3: Update Editor Layout with Timeline (15 minutes)

**File to edit:** `src/components/EditorLayout.tsx`

**What to do:**
1. Import the Timeline component:
```typescript
import TimelineRuler from './TimelineRuler';
```

2. Replace the placeholder timeline footer with:

```typescript
{/* Timeline */}
<TimelineRuler />
```

**Complete updated section:**

```typescript
{/* ... existing code ... */}

<DropZone>
  <VideoPlayer />
</DropZone>

<TimelineRuler />

{/* ... rest ... */}
```

---

### Step 4: Add Trim Shortcuts (30 minutes)

**File to edit:** `src/hooks/useKeyboardShortcuts.ts`

**What to do:**
1. Add trim-related keyboard shortcuts:

```typescript
import { useEffect } from 'react';
import { useVideoStore } from '../store/videoStore';

export function useKeyboardShortcuts() {
  const {
    isPlaying,
    currentTime,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setTrimPoints
  } = useVideoStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          setPlaying(!isPlaying);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setCurrentTime(Math.max(0, currentTime - 5));
          break;

        case 'ArrowRight':
          e.preventDefault();
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 5));
          break;

        case 'KeyJ':
          e.preventDefault();
          setCurrentTime(Math.max(0, currentTime - 0.033));
          break;

        case 'KeyL':
          e.preventDefault();
          setCurrentTime(Math.min(videoDuration || 0, currentTime + 0.033));
          break;

        // NEW TRIM SHORTCUTS
        case 'KeyI':
          // Set trim start to current time
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(currentTime, Math.max(currentTime + 1, trimEnd));
          }
          break;

        case 'KeyO':
          // Set trim end to current time
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(Math.min(trimStart, currentTime - 1), currentTime);
          }
          break;

        case 'KeyR':
          // Reset trim to full video
          e.preventDefault();
          if (videoDuration) {
            setTrimPoints(0, videoDuration);
          }
          break;

        case 'Home':
          // Jump to trim start
          e.preventDefault();
          setCurrentTime(trimStart);
          break;

        case 'End':
          // Jump to trim end
          e.preventDefault();
          setCurrentTime(trimEnd);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaying,
    currentTime,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setTrimPoints
  ]);
}
```

**New shortcuts:**
- `I` - Set trim start (In point) to current time
- `O` - Set trim end (Out point) to current time
- `R` - Reset trim to full video
- `Home` - Jump to trim start
- `End` - Jump to trim end

---

### Step 5: Add Trim Validation (20 minutes)

**File to edit:** `src/store/videoStore.ts`

**What to do:**
1. Add validation to the `setTrimPoints` method:

```typescript
setTrimPoints: (start, end) => {
  // Validation
  const validStart = Math.max(0, start);
  const validEnd = Math.min(get().videoDuration || Infinity, end);

  // Ensure minimum trim duration (0.5 seconds)
  const minDuration = 0.5;
  if (validEnd - validStart < minDuration) {
    console.warn('Trim duration too short, minimum is 0.5s');
    return;
  }

  set({
    trimStart: validStart,
    trimEnd: validEnd
  });
},
```

**What this does:**
- Ensures start is not negative
- Ensures end doesn't exceed video duration
- Enforces minimum trim duration of 0.5 seconds
- Prevents invalid trim ranges

---

### Step 6: Sync Video Player with Trim Points (20 minutes)

**File to edit:** `src/components/VideoPlayer.tsx`

**What to do:**
1. Add logic to jump to trim start when video is at beginning:

```typescript
// Add this effect to VideoPlayer component
useEffect(() => {
  const video = videoRef.current;
  if (!video || !trimStart) return;

  // When video loads, start at trim point
  const handleLoadedMetadata = () => {
    video.currentTime = trimStart;
    setCurrentTime(trimStart);
  };

  video.addEventListener('loadedmetadata', handleLoadedMetadata);
  return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
}, [trimStart, setCurrentTime]);
```

2. Update the `handleTimeUpdate` to loop within trim range (optional enhancement):

```typescript
const handleTimeUpdate = () => {
  const video = videoRef.current;
  if (!video) return;

  setCurrentTime(video.currentTime);

  // Auto-pause at trim end
  if (trimEnd && video.currentTime >= trimEnd) {
    video.pause();
    setPlaying(false);
    // Optional: Loop back to trim start
    video.currentTime = trimStart;
    setCurrentTime(trimStart);
  }

  // Skip to trim start if before it
  if (trimStart && video.currentTime < trimStart) {
    video.currentTime = trimStart;
  }
};
```

---

### Step 7: Test Timeline and Trim Functionality (30 minutes)

**What to do:**
1. Run the app:
   ```bash
   npm run tauri dev
   ```

2. **Test timeline display:**
   - Import a video
   - Verify timeline appears at bottom
   - Check that time markers are visible

3. **Test trim handles:**
   - Drag the left (start) handle
   - Verify highlighted region shrinks
   - Drag the right (end) handle
   - Verify region adjusts

4. **Test playhead:**
   - Play video
   - Watch playhead move along timeline
   - Click on timeline to seek
   - Verify video jumps to clicked time

5. **Test keyboard shortcuts:**
   - Play video to middle
   - Press `I` to set in point
   - Play further
   - Press `O` to set out point
   - Verify trim region updates
   - Press `R` to reset
   - Press `Home` to jump to start
   - Press `End` to jump to end

6. **Test trim playback:**
   - Set trim points
   - Press `Home` to jump to trim start
   - Press `Space` to play
   - Verify video stops at trim end
   - Verify it loops back to trim start

**Expected behavior:**
- Timeline accurately represents video duration
- Trim handles are draggable and responsive
- Highlighted region shows selected portion
- Playhead syncs with video playback
- Clicking timeline seeks video
- Keyboard shortcuts work for setting trim points
- Video respects trim boundaries during playback

---

## Success Criteria

- [ ] Timeline displays with time markers
- [ ] Trim region is visually highlighted
- [ ] Trim start handle is draggable
- [ ] Trim end handle is draggable
- [ ] Playhead moves as video plays
- [ ] Clicking timeline seeks video
- [ ] `I` key sets trim start
- [ ] `O` key sets trim end
- [ ] `R` key resets trim
- [ ] `Home` jumps to trim start
- [ ] `End` jumps to trim end
- [ ] Video stops at trim end point
- [ ] Trim duration displays correctly
- [ ] Minimum trim duration enforced

---

## Common Issues & Solutions

### Issue: Canvas not drawing
**Solution**:
- Check that canvas width/height are set
- Verify `containerRef.current` exists
- Look for errors in console

### Issue: Dragging is jumpy
**Solution**:
- Normal behavior - canvas redraws on every state change
- For smoother dragging, could use RAF (requestAnimationFrame)
- Good enough for MVP

### Issue: Trim handles hard to grab
**Solution**:
- Increase threshold value in `handleMouseDown`
- Currently set to 10 pixels

### Issue: Keyboard shortcuts conflict with browser
**Solution**:
- Use `e.preventDefault()` (already implemented)
- Some keys may still be captured by OS/browser

---

## Optional Enhancements (Post-MVP)

- Thumbnail filmstrip view
- Zoom in/out on timeline
- Snap to keyframes
- Multi-selection for cutting multiple segments
- Waveform visualization for audio
- Markers/labels

---

## Next Steps

Once this feature is complete:
1. Move to **PRD-05: Video Export** to implement FFmpeg trim export
2. The `trimStart` and `trimEnd` values will be passed to FFmpeg
3. Timeline provides visual feedback during export

---

## Files Created/Modified

- ✅ `src/components/Timeline.tsx` (new - simple version)
- ✅ `src/components/TimelineRuler.tsx` (new - canvas version)
- ✅ `src/hooks/useKeyboardShortcuts.ts` (modified - added trim shortcuts)
- ✅ `src/store/videoStore.ts` (modified - added trim validation)
- ✅ `src/components/VideoPlayer.tsx` (modified - trim boundary logic)
- ✅ `src/components/EditorLayout.tsx` (modified - added timeline)
