# ClipForge Sequential View Architecture

**Last Updated:** 2025-10-29
**Version:** Current Implementation Analysis

This document provides a comprehensive technical profile of how media clips are imported, processed, and rendered in ClipForge's sequential view timeline.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Flow: Clip Import to Timeline](#data-flow-clip-import-to-timeline)
4. [Component Hierarchy](#component-hierarchy)
5. [State Management (Zustand Store)](#state-management-zustand-store)
6. [Core Data Structures](#core-data-structures)
7. [Key Components Deep Dive](#key-components-deep-dive)
8. [Video Loading Pipeline](#video-loading-pipeline)
9. [Timeline Rendering](#timeline-rendering)
10. [Playback System](#playback-system)
11. [Important Code Paths](#important-code-paths)

---

## Overview

ClipForge's sequential view is a multi-clip video editor where clips are played back sequentially (one after another) rather than overlaid. The architecture follows a unidirectional data flow pattern using Zustand for state management, with React hooks handling side effects like video metadata loading and blob URL generation.

**Key Architectural Principles:**
- Centralized state management via Zustand (`videoStore.ts`)
- Separation of concerns: UI components consume store state, hooks handle side effects
- Pre-loading strategy: Videos are converted to blob URLs before playback
- Timeline calculated from sequential clip positions and trimmed durations
- Support for PiP (Picture-in-Picture) overlay track

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION ENTRY                         │
│                                                                   │
│  App.tsx → EditorLayout.tsx (Sequential View Container)         │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      IMPORT/RECORDING LAYER                      │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ ImportButton│  │ RecordButton │  │   DropZone   │           │
│  │   (Manual)  │  │   (Dialog)   │  │ (Drag&Drop)  │           │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                │                  │                    │
│         └────────────────┴──────────────────┘                    │
│                          │                                       │
│                          ▼                                       │
│                 videoStore.addClip(path, name)                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STATE MANAGEMENT LAYER                        │
│                                                                   │
│                      videoStore (Zustand)                        │
│   • clips: Clip[]                                                │
│   • videoDuration: number (calculated)                           │
│   • currentTime: number                                          │
│   • isPlaying: boolean                                           │
│   • pipTrack: Track | null                                       │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SIDE EFFECTS LAYER                           │
│                                                                   │
│              useVideoMetadata() Hook (Automated)                 │
│   • Watches clips array for new entries                          │
│   • Loads video metadata (duration, resolution) via Tauri        │
│   • Generates blob URLs via videoLoader utility                  │
│   • Updates store: updateClipMetadata(), updateClipBlobUrl()    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
│                                                                   │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐      │
│  │  MediaPanel    │  │ VideoPlayer  │  │ TimelineRuler  │      │
│  │ (Clip Cards)   │  │  (Playback)  │  │(Visual Timeline)│     │
│  └────────────────┘  └──────────────┘  └────────────────┘      │
│         │                    │                   │               │
│         └────────────────────┴───────────────────┘               │
│                          │                                       │
│                          ▼                                       │
│                  Consumes Store State                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Clip Import to Timeline

### Step-by-Step Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: USER ACTION (Import/Record/Drop)                         │
└──────────────────────────────────────────────────────────────────┘
   │
   │ Triggers one of:
   │ • ImportButton.tsx → open_file_dialog (Tauri command)
   │ • RecordingDialog.tsx → start_*_recording → addClip()
   │ • DropZone.tsx → onDragDropEvent → addClip()
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: CLIP CREATION (videoStore.addClip)                       │
│ Location: src/store/videoStore.ts:154-183                        │
└──────────────────────────────────────────────────────────────────┘
   │
   │ Creates new Clip object:
   │   {
   │     id: "clip-{timestamp}-{random}",
   │     path: "/path/to/video.mp4",
   │     name: "video.mp4",
   │     duration: null,              // Not yet loaded
   │     resolution: null,             // Not yet loaded
   │     trimStart: 0,
   │     trimEnd: 0,
   │     startTimeInSequence: <calculated>,
   │     blobUrl: null                 // Not yet loaded
   │   }
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3: METADATA LOADING (useVideoMetadata Hook)                 │
│ Location: src/hooks/useVideoMetadata.ts:17-136                   │
└──────────────────────────────────────────────────────────────────┘
   │
   │ Triggered by: clips array change (useEffect dependency)
   │
   │ A. Fetch Metadata via Tauri:
   │    invoke('get_video_metadata', { videoPath })
   │    └─> Returns FFmpeg probe data (JSON)
   │        • duration: float (seconds)
   │        • resolution: { width, height }
   │
   │ B. Load Video File as Blob:
   │    loadVideoBlob(clipId, videoPath)
   │    └─> invoke('get_video_file', { videoPath })
   │        • Returns video bytes (number[])
   │        • Converts to Blob → URL.createObjectURL()
   │        • Returns blob:// URL string
   │
   │ C. Update Store:
   │    • updateClipMetadata(clipId, duration, resolution)
   │    • updateClipBlobUrl(clipId, blobUrl)
   │    • addTrack(clipData) → Creates composite track
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4: TIMELINE RECALCULATION (videoStore internals)            │
│ Location: src/store/videoStore.ts:111-128                        │
└──────────────────────────────────────────────────────────────────┘
   │
   │ Helper Functions:
   │ • recalculateStartTimes(clips[]) → Updates each clip's
   │   startTimeInSequence based on trimmed durations
   │ • calculateTotalDuration(clips[]) → Sums all trimmed durations
   │
   │ Result:
   │   videoDuration = sum of all (trimEnd - trimStart)
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 5: UI RENDERING                                              │
└──────────────────────────────────────────────────────────────────┘
   │
   ├─> MediaPanel.tsx (Line 287-360)
   │   • Displays horizontal list of ClipCard components
   │   • Each card shows thumbnail, duration, resolution
   │   • Handles reordering, removal, trim reset
   │
   ├─> VideoPlayer.tsx (Line 13-554)
   │   • Determines which clip to play based on currentTime
   │   • Loads clip's blobUrl into <video> element
   │   • Handles playback, seeking, clip transitions
   │
   └─> TimelineRuler.tsx (Line 6-383)
       • Renders canvas-based visual timeline
       • Shows clip blocks with trim handles
       • Displays playhead position
       • Handles timeline interactions (seek, trim, split)
```

---

## Component Hierarchy

```
App.tsx
└── EditorLayout.tsx (Sequential View)
    ├── AppBar
    │   ├── ImportButton.tsx
    │   ├── RecordButton.tsx → RecordingDialog.tsx
    │   └── ExportButton.tsx
    │
    ├── Info Chips (clips count, duration, resolution)
    │
    ├── DropZone.tsx (wraps main content)
    │   ├── VideoPlayer.tsx
    │   │   ├── <video> (main clip)
    │   │   └── <video> (PiP overlay, conditional)
    │   │
    │   └── PipControls.tsx (conditional)
    │
    ├── MediaPanel.tsx
    │   └── ClipCard[] (one per clip)
    │       └── useVideoThumbnail() hook
    │
    └── TimelineRuler.tsx
        └── <canvas> (timeline visualization)
```

**File Locations:**
- `/src/App.tsx` (Root: Line 6-22)
- `/src/components/EditorLayout.tsx` (Main Layout: Line 19-105)
- `/src/components/ImportButton.tsx` (Import UI: Line 8-83)
- `/src/components/RecordButton.tsx` (Record UI: Line 6-28)
- `/src/components/RecordingDialog.tsx` (Recording: Line 45-515)
- `/src/components/DropZone.tsx` (Drag&Drop: Line 18-161)
- `/src/components/MediaPanel.tsx` (Clip Cards: Line 287-360)
- `/src/components/VideoPlayer.tsx` (Playback: Line 13-554)
- `/src/components/TimelineRuler.tsx` (Timeline: Line 6-383)
- `/src/components/PipControls.tsx` (PiP Settings: Line 5-152)

---

## State Management (Zustand Store)

### Store Location
**File:** `/src/store/videoStore.ts`

### Core State Structure

```typescript
interface VideoState {
  // ============ CLIP MANAGEMENT ============
  clips: Clip[]                    // Array of all imported clips (sequential order)

  // ============ PLAYBACK STATE ============
  isPlaying: boolean               // Global play/pause state
  currentTime: number              // Playhead position (seconds, relative to entire timeline)
  volume: number                   // Main volume (0-1)
  videoDuration: number | null     // Total duration of all clips (calculated)

  // ============ PIP TRACK ============
  pipTrack: Track | null          // Picture-in-picture overlay clip

  // ============ COMPOSITE STATE ============
  composite: CompositeState        // Multi-track compositing state (future use)

  // ============ LEGACY COMPATIBILITY ============
  videoPath: string | null         // Path of the most recent clip
  videoName: string | null         // Name of the most recent clip
  videoResolution: { width, height } | null
}
```

### Key Store Methods

#### Clip Management
```typescript
// Add a new clip to the timeline
addClip(path: string, name: string): string
  Location: videoStore.ts:154-183
  Returns: clipId (string)
  Side Effects:
    - Creates Clip object with null metadata
    - Appends to clips array
    - Sets startTimeInSequence based on existing clips
    - Triggers useVideoMetadata hook

// Update clip metadata after loading
updateClipMetadata(clipId: string, duration: number, resolution: {...}): void
  Location: videoStore.ts:185-213
  Side Effects:
    - Updates clip's duration and resolution
    - Sets trimEnd = duration (initially uncut)
    - Recalculates all clip startTimeInSequence values
    - Updates videoDuration

// Update clip blob URL after loading
updateClipBlobUrl(clipId: string, blobUrl: string): void
  Location: videoStore.ts:215-233
  Side Effects:
    - Stores pre-loaded blob URL for instant playback
```

#### Timeline Operations
```typescript
// Adjust clip trim points (non-destructive editing)
updateClipTrim(clipId: string, trimStart: number, trimEnd: number): void
  Location: videoStore.ts:235-275
  Constraints:
    - trimStart >= 0
    - trimEnd <= clip.duration
    - (trimEnd - trimStart) >= 0.1 seconds (minimum)
  Side Effects:
    - Recalculates timeline positions
    - Updates videoDuration

// Split clip at playhead position
splitClipAtTime(clipId: string, splitTime: number): void
  Location: videoStore.ts:368-453
  Creates two new clips:
    - Clip 1: trimStart → splitPoint
    - Clip 2: splitPoint → trimEnd
  Side Effects:
    - Replaces original clip with two clips
    - Recalculates timeline
    - Keeps playhead at split position

// Reorder clips in timeline
reorderClip(clipId: string, newIndex: number): void
  Location: videoStore.ts:332-366
  Side Effects:
    - Moves clip to new position
    - Recalculates all startTimeInSequence values
```

#### Helper Functions
```typescript
// Calculate total timeline duration
function calculateTotalDuration(clips: Clip[]): number
  Location: videoStore.ts:111-116
  Formula: lastClip.startTimeInSequence + (lastClip.trimEnd - lastClip.trimStart)

// Recalculate sequential positions
function recalculateStartTimes(clips: Clip[]): Clip[]
  Location: videoStore.ts:119-128
  Logic:
    - Iterates through clips in order
    - Sets startTimeInSequence = accumulated duration
    - Accumulates trimmed duration: (trimEnd - trimStart)
```

---

## Core Data Structures

### Clip Interface
**File:** `/src/store/videoStore.ts:12-22`

```typescript
interface Clip {
  id: string;                      // Unique identifier (format: "clip-{timestamp}-{random}")
  path: string;                    // File system path (e.g., "/path/to/video.mp4")
  name: string;                    // Display name (filename)
  duration: number | null;         // Video duration in seconds (null until loaded)
  resolution: {                    // Video dimensions (null until loaded)
    width: number;
    height: number;
  } | null;
  trimStart: number;               // Trim start point (seconds, default: 0)
  trimEnd: number;                 // Trim end point (seconds, default: duration)
  startTimeInSequence: number;     // When this clip starts in the timeline (seconds)
  blobUrl: string | null;          // Pre-loaded blob URL for <video> element
}
```

**Lifecycle:**
1. **Creation** (`addClip`): All fields except id/path/name are null
2. **Metadata Load** (`updateClipMetadata`): duration, resolution set; trimEnd = duration
3. **Blob Load** (`updateClipBlobUrl`): blobUrl set
4. **User Edits** (`updateClipTrim`): trimStart/trimEnd modified
5. **Timeline Changes** (`recalculateStartTimes`): startTimeInSequence updated

### Track Interface (PiP Support)
**File:** `/src/types/clip.ts:27-54`

```typescript
interface Track {
  // Identity
  id: string;
  name: string;
  clipData: ClipData;              // References original clip data

  // Position (for PiP overlay)
  position: { x: number; y: number };

  // Playback Properties
  volume: number;                  // 0-1 range
  opacity: number;                 // 0-1 range
  zIndex: number;                  // Layer depth
  isVisible: boolean;

  // Timing (in milliseconds)
  offset: number;                  // Start time in timeline
  duration: number;                // Length of track

  // Metadata
  createdAt: Date;
  sourceFile?: string;
}
```

**Usage in Sequential View:**
- PiP track overlays a second video on top of the main timeline
- Position determines corner placement (top-left, top-right, etc.)
- Volume/opacity controlled independently

---

## Key Components Deep Dive

### MediaPanel (Clip Cards Display)

**File:** `/src/components/MediaPanel.tsx`

**Purpose:** Displays all imported clips as horizontal scrolling cards with thumbnails.

**Key Functions:**

```typescript
// Individual clip card component
function ClipCard({ clip, index, totalClips, isActive, isPipTrack, ... })
  Location: MediaPanel.tsx:19-284

  Features:
  • Thumbnail generation via useVideoThumbnail(clip.path, clip.trimStart)
  • Duration display (trimmed vs. full)
  • Resolution overlay
  • Reorder buttons (ArrowBack/ArrowForward)
  • Reset trim button (conditional)
  • PiP toggle button
  • Remove button

  Active State: Border highlight when clip is currently playing
  PiP State: Purple border when clip is PiP track

// Main panel container
function MediaPanel()
  Location: MediaPanel.tsx:287-360

  Behavior:
  • Returns null if no clips
  • Horizontal scroll container with custom scrollbar
  • Maps clips array to ClipCard components
  • Passes store actions as callbacks
```

**Store Subscriptions:**
- `clips` (array of all clips)
- `pipTrack` (current PiP overlay)
- `getCurrentClip()` (active clip for highlighting)
- `removeClip()`, `reorderClip()`, `resetClipTrim()` (actions)

### VideoPlayer (Playback Engine)

**File:** `/src/components/VideoPlayer.tsx`

**Purpose:** Handles video playback, clip switching, and PiP overlay rendering.

**Key Logic:**

```typescript
// Determine which clip should be playing
useEffect(() => {
  const clip = getCurrentClip();  // Finds clip containing currentTime

  // Switch video source when clip changes
  if (clip.id !== currentClipId) {
    setVideoSrc(clip.blobUrl);
    setCurrentClipId(clip.id);
  }
}, [currentTime, clips])
Location: VideoPlayer.tsx:34-59

// Load new video and seek to correct position
useEffect(() => {
  video.load();

  video.addEventListener('loadedmetadata', () => {
    const clip = getCurrentClip();
    const timeInClip = currentTime - clip.startTimeInSequence;

    // Video time = trimStart + offset within clip
    video.currentTime = clip.trimStart + timeInClip;

    if (wasPlaying) video.play();
  });
}, [videoSrc])
Location: VideoPlayer.tsx:62-103

// Update timeline position as video plays
function handleTimeUpdate()
  Location: VideoPlayer.tsx:258-293

  Logic:
  • Reads video.currentTime (includes trimStart offset)
  • Converts to timeline time:
      sequenceTime = clip.startTimeInSequence + (video.currentTime - clip.trimStart)
  • Updates store: setCurrentTime(sequenceTime)
  • Checks if clip end reached:
      - If next clip exists: Jump to next clip
      - If last clip: Pause playback
```

**PiP Video Handling:**
```typescript
// Load PiP video
useEffect(() => {
  if (pipTrack) {
    const originalClip = clips.find(c => c.id === pipTrack.clipData.id);
    setPipVideoSrc(originalClip.blobUrl);
  }
}, [pipTrack, clips])
Location: VideoPlayer.tsx:105-134

// Sync PiP playback with main video
useEffect(() => {
  const pipStartTime = pipTrack.offset / 1000;
  const pipEndTime = pipStartTime + (pipTrack.duration / 1000);

  const shouldBeVisible = currentTime >= pipStartTime && currentTime < pipEndTime;

  if (shouldBeVisible) {
    const timeInPip = currentTime - pipStartTime;
    pipVideo.currentTime = timeInPip;
    if (isPlaying) pipVideo.play();
  } else {
    pipVideo.pause();
  }
}, [pipTrack, currentTime, isPlaying])
Location: VideoPlayer.tsx:136-167
```

**Store Subscriptions:**
- `clips`, `pipTrack`, `isPlaying`, `currentTime`, `volume`
- `getCurrentClip()`, `setPlaying()`, `setCurrentTime()`

### TimelineRuler (Visual Timeline)

**File:** `/src/components/TimelineRuler.tsx`

**Purpose:** Canvas-based timeline visualization with interactive trim handles, playhead, and split button.

**Canvas Drawing Logic:**

```typescript
useEffect(() => {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');

  // 1. Draw track backgrounds
  if (pipTrack) {
    // Main track: 65% of height
    // PiP track: 35% of height (bottom)
  }

  // 2. Draw clip blocks
  clips.forEach((clip, index) => {
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    const clipStartX = (clip.startTimeInSequence / videoDuration) * width;
    const clipEndX = clipStartX + (trimmedDuration / videoDuration) * width;

    // Draw clip rectangle (alternating colors)
    ctx.fillRect(clipStartX, 0, clipWidth, height);

    // Draw trim handles (gold rectangles at edges)
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(clipStartX - 2, 0, 4, height);  // Left handle
    ctx.fillRect(clipEndX - 2, 0, 4, height);     // Right handle

    // Draw clip name and duration
    if (clipWidth > 60) {
      ctx.fillText(clip.name, clipStartX + 4, 4);
      ctx.fillText(formatTime(trimmedDuration), clipStartX + 4, 18);
    }
  });

  // 3. Draw PiP track (if exists)
  if (pipTrack) {
    const pipStartX = (pipTrack.offset / 1000 / videoDuration) * width;
    const pipWidth = (pipTrack.duration / 1000 / videoDuration) * width;
    ctx.fillRect(pipStartX, pipTrackTop, pipWidth, pipTrackHeight);
  }

  // 4. Draw playhead (pink line)
  const playheadX = (currentTime / videoDuration) * width;
  ctx.fillRect(playheadX - 1, 0, 2, height);

  // 5. Draw time markers
  for (let i = 0; i <= videoDuration; i += markerInterval) {
    ctx.fillText(formatTime(i), x + 2, height - 12);
  }
}, [clips, pipTrack, currentTime, videoDuration])
Location: TimelineRuler.tsx:52-180
```

**Interaction Handling:**

```typescript
// Mouse down: Determine what was clicked
function handleMouseDown(e)
  Location: TimelineRuler.tsx:183-237

  Priority:
  1. Clip trim handles (10px threshold)
     → Start dragging: { type: 'clip-start'/'clip-end', clipId }
  2. Playhead (10px threshold)
     → Start dragging: { type: 'playhead' }
  3. Timeline background
     → Seek to clicked position

// Mouse move: Drag trim handles or playhead
function handleMouseMove(e)
  Location: TimelineRuler.tsx:240-274

  If dragging clip-start:
    • Calculate new trimStart
    • Constrain: 0 ≤ trimStart ≤ (trimEnd - 0.1)
    • Call: updateClipTrim(clipId, newTrimStart, trimEnd)

  If dragging clip-end:
    • Calculate new trimEnd
    • Constrain: (trimStart + 0.1) ≤ trimEnd ≤ duration
    • Call: updateClipTrim(clipId, trimStart, newTrimEnd)

  If dragging playhead:
    • Update currentTime
```

**Split Button:**

```typescript
// Check if split is valid at playhead
function canSplitAtPlayhead()
  Location: TimelineRuler.tsx:31-41

  Requirements:
  • Playhead is within a clip
  • At least 0.1s from clip start
  • At least 0.1s from clip end

  Returns: boolean

// Render split button (floating above timeline)
{canSplitAtPlayhead() && (
  <IconButton onClick={handleSplitClip} ...>
    <ContentCutIcon />
  </IconButton>
)}
Location: TimelineRuler.tsx:340-377
```

**Store Subscriptions:**
- `clips`, `pipTrack`, `videoDuration`, `currentTime`, `isSplitting`
- `getCurrentClip()`, `setCurrentTime()`, `updateClipTrim()`, `splitClipAtTime()`

---

## Video Loading Pipeline

### Phase 1: File System Access (Tauri Backend)

**Tauri Commands:**
- `get_video_file` - Reads video file as byte array
- `get_video_metadata` - Extracts metadata using FFmpeg

**File:** `/src-tauri/src/lib.rs` (referenced in hooks)

### Phase 2: Metadata Loading Hook

**File:** `/src/hooks/useVideoMetadata.ts`

**Trigger:** Runs whenever `clips` array changes (new clip added)

```typescript
useEffect(() => {
  clips.forEach((clip) => {
    // Skip if already processed
    if (fetchedClipIds.current.has(clip.id)) return;
    if (clip.duration !== null && clip.blobUrl !== null) return;

    // Mark as processing
    fetchedClipIds.current.add(clip.id);

    const fetchMetadata = async () => {
      // 1. Get metadata from FFmpeg
      if (clip.duration === null) {
        const metadataJson = await invoke('get_video_metadata', { videoPath: clip.path });
        const metadata = JSON.parse(metadataJson);
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');

        const duration = parseFloat(metadata.format.duration);
        const resolution = {
          width: videoStream.width,
          height: videoStream.height
        };

        updateClipMetadata(clip.id, duration, resolution);
      }

      // 2. Load video as blob
      if (!clip.blobUrl) {
        const blobUrl = await loadVideoBlob(clip.id, clip.path);
        updateClipBlobUrl(clip.id, blobUrl);
      }

      // 3. Create composite track (for future multi-track use)
      if (duration && resolution && !clip.duration) {
        addTrack({
          id: clip.id,
          path: clip.path,
          name: clip.name,
          duration: duration * 1000,  // Convert to ms
          width: resolution.width,
          height: resolution.height
        });
      }
    };

    fetchMetadata();
  });
}, [clips]);
```
Location: useVideoMetadata.ts:17-136

### Phase 3: Blob URL Generation

**File:** `/src/utils/videoLoader.ts`

```typescript
export async function loadVideoBlob(clipId: string, videoPath: string): Promise<string | null> {
  // 1. Request video file bytes from Tauri
  const videoBytes = await invoke('get_video_file', { videoPath }) as number[];

  // 2. Convert to typed array
  const uint8Array = new Uint8Array(videoBytes);

  // 3. Create blob with video/mp4 MIME type
  const blob = new Blob([uint8Array], { type: 'video/mp4' });

  // 4. Generate blob URL
  const blobUrl = URL.createObjectURL(blob);

  // Returns: "blob:http://localhost:1420/uuid"
  return blobUrl;
}
```
Location: videoLoader.ts:3-30

**Memory Management:**
- Blob URLs are revoked when clips are removed (`removeClip` method)
- Cleanup: `URL.revokeObjectURL(blobUrl)` in videoStore.ts:314

### Phase 4: Thumbnail Generation

**File:** `/src/hooks/useVideoThumbnail.ts`

**Used By:** `ClipCard` component in MediaPanel

```typescript
useVideoThumbnail(videoPath: string, seekTime?: number): string | null
  Location: useVideoThumbnail.ts:11-242

  Process:
  1. Load video file as blob (same as playback)
  2. Create temporary <video> element (offscreen)
  3. Wait for 'canplay' event
  4. Seek to specified time (or 1 second / 10% of duration)
  5. Wait for 'seeked' event
  6. Draw current frame to <canvas>
  7. Convert canvas to data URL: canvas.toDataURL('image/jpeg', 0.8)
  8. Clean up video element and blob URL
  9. Return data URL (Base64 JPEG)

  Optimization:
  • Uses seekTime = clip.trimStart for unique thumbnails of split clips
  • Aborts previous generation if called again with new parameters
  • 5-second timeout fallbacks for unreliable video events
```

---

## Timeline Rendering

### Timeline Calculation

**Concept:** Clips are arranged sequentially with no gaps. Each clip's `startTimeInSequence` is the end time of the previous clip.

**Formula:**
```
clip[0].startTimeInSequence = 0
clip[n].startTimeInSequence = clip[n-1].startTimeInSequence + (clip[n-1].trimEnd - clip[n-1].trimStart)

videoDuration = clip[last].startTimeInSequence + (clip[last].trimEnd - clip[last].trimStart)
```

**Implementation:**
```typescript
function recalculateStartTimes(clips: Clip[]): Clip[] {
  let currentTime = 0;

  return clips.map(clip => {
    const updatedClip = { ...clip, startTimeInSequence: currentTime };
    const trimmedDuration = clip.duration !== null
      ? (clip.trimEnd - clip.trimStart)
      : 0;
    currentTime += trimmedDuration;
    return updatedClip;
  });
}
```
Location: videoStore.ts:119-128

**Triggering Recalculation:**
- Clip added: `addClip()`
- Clip removed: `removeClip()`
- Clip reordered: `reorderClip()`
- Clip trimmed: `updateClipTrim()`
- Clip split: `splitClipAtTime()`
- Metadata loaded: `updateClipMetadata()`

### Current Clip Determination

**Function:** `getCurrentClip()`
**Location:** `videoStore.ts:477-496`

```typescript
getCurrentClip(): Clip | null {
  const currentTime = state.currentTime;

  // Find which clip contains the playhead
  for (const clip of clips) {
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    const clipEndTime = clip.startTimeInSequence + trimmedDuration;

    if (currentTime >= clip.startTimeInSequence && currentTime < clipEndTime) {
      return clip;
    }
  }

  // If past all clips, return the last clip
  if (clips.length > 0) {
    return clips[clips.length - 1];
  }

  return null;
}
```

**Usage:**
- VideoPlayer: Determines which video to load
- MediaPanel: Highlights active clip card
- TimelineRuler: Validates split operations

### Trim Constraints

**Minimum Trim Duration:** 0.1 seconds

**Validation:**
```typescript
// In updateClipTrim()
const validTrimStart = Math.max(0, Math.min(trimStart, duration));
const validTrimEnd = Math.max(validTrimStart, Math.min(trimEnd, duration));

const minDuration = 0.1;
if (validTrimEnd - validTrimStart < minDuration) {
  console.warn('Trim duration too short, minimum is 0.1s');
  return;  // Reject change
}
```
Location: videoStore.ts:235-275

**UI Feedback:**
- TimelineRuler prevents dragging trim handles too close
- Split button disabled if too close to clip edges

---

## Playback System

### Play/Pause Control Flow

```
User clicks play button
        ↓
VideoPlayer.tsx: togglePlayPause()
        ↓
setPlaying(!isPlaying)
        ↓
Store updates: isPlaying = true
        ↓
VideoPlayer useEffect triggered (Line 192-231)
        ↓
video.play() called
        ↓
'play' event fires → console log
        ↓
'timeupdate' events start firing
        ↓
handleTimeUpdate() called repeatedly
        ↓
Updates currentTime in store
```

### Clip Transition Logic

**Location:** `VideoPlayer.tsx:258-337`

```typescript
function handleTimeUpdate() {
  const clip = getCurrentClip();
  const timeInClip = video.currentTime - clip.trimStart;
  const trimmedDuration = clip.trimEnd - clip.trimStart;

  // Update timeline position
  const sequenceTime = clip.startTimeInSequence + timeInClip;
  setCurrentTime(sequenceTime);

  // Check if clip end reached (within 50ms threshold)
  if (timeInClip >= trimmedDuration - 0.05) {
    const clipEndTime = clip.startTimeInSequence + trimmedDuration;
    const hasNextClip = clips.some(c => c.startTimeInSequence >= clipEndTime);

    if (hasNextClip) {
      // Jump to next clip
      setCurrentTime(clipEndTime + 0.01);  // Slightly past end
      // VideoPlayer effect will switch video source
    } else {
      // No more clips, pause
      video.pause();
      setPlaying(false);
    }
  }
}

// Fallback: Video 'ended' event handler
function handleEnded() {
  const endedClipIndex = clips.findIndex(c => c.id === currentClipId);

  if (endedClipIndex < clips.length - 1) {
    const nextClip = clips[endedClipIndex + 1];
    setCurrentTime(nextClip.startTimeInSequence);
    setPlaying(true);  // Keep playing
  } else {
    setPlaying(false);  // Last clip, stop
  }
}
```

**Key Points:**
- Primary transition: `handleTimeUpdate()` detects clip end
- Fallback: `handleEnded()` event catches missed transitions
- Seamless playback: `isPlaying` state maintained during clip switch
- Video source change triggers metadata loading and auto-seek

### Seeking Behavior

**Timeline Seek (via TimelineRuler):**
```typescript
// User clicks timeline
handleMouseDown(e) {
  const timeAtX = (x / width) * videoDuration;
  setCurrentTime(timeAtX);
}
```
Location: TimelineRuler.tsx:236

**Effect in VideoPlayer:**
```typescript
useEffect(() => {
  const clip = getCurrentClip();
  const timeInClip = currentTime - clip.startTimeInSequence;
  const desiredVideoTime = clip.trimStart + timeInClip;

  // Only update if significant difference (avoid feedback loop)
  if (Math.abs(video.currentTime - desiredVideoTime) > 0.5) {
    video.currentTime = desiredVideoTime;
  }
}, [currentTime, getCurrentClip]);
```
Location: VideoPlayer.tsx:234-248

**Clip Switch on Seek:**
- If `currentTime` moves to a different clip's range
- `getCurrentClip()` returns different clip
- VideoPlayer effect switches `videoSrc`
- New video loads and seeks to correct position

---

## Important Code Paths

### Path 1: Import Video → Display in Timeline

```
ImportButton.tsx:handleImport() (Line 13-55)
  → invoke('open_file_dialog')
  → addClip(filePath, fileName)
    ↓
videoStore.ts:addClip() (Line 154-183)
  → Create Clip object (null metadata)
  → Append to clips array
  → Set store state
    ↓
useVideoMetadata.ts:useEffect() (Line 17-136)
  → Detect new clip
  → invoke('get_video_metadata')
  → loadVideoBlob()
  → updateClipMetadata()
  → updateClipBlobUrl()
    ↓
videoStore.ts:updateClipMetadata() (Line 185-213)
  → Set duration, resolution
  → recalculateStartTimes()
  → Update videoDuration
    ↓
MediaPanel.tsx:render() (Line 287-360)
  → Map clips to ClipCard components
  → useVideoThumbnail() generates thumbnail
  → Display in horizontal scroll
    ↓
TimelineRuler.tsx:canvas draw() (Line 52-180)
  → Draw clip blocks on canvas
  → Show trim handles
  → Render playhead
```

### Path 2: Play Video → Clip Transition

```
VideoPlayer.tsx:togglePlayPause() (Line 340-343)
  → setPlaying(true)
    ↓
VideoPlayer.tsx:useEffect [isPlaying] (Line 192-231)
  → video.play()
    ↓
VideoPlayer.tsx:handleTimeUpdate() (Line 258-293)
  → Read video.currentTime
  → Convert to sequence time
  → setCurrentTime(sequenceTime)
  → Check if clip end reached
    ↓
IF clip end AND next clip exists:
  → setCurrentTime(nextClipStartTime)
    ↓
VideoPlayer.tsx:useEffect [currentTime] (Line 34-59)
  → getCurrentClip() returns next clip
  → clip.id !== currentClipId
  → setVideoSrc(nextClip.blobUrl)
    ↓
VideoPlayer.tsx:useEffect [videoSrc] (Line 62-103)
  → video.load()
  → Wait for 'loadedmetadata'
  → Seek to correct position
  → video.play() if was playing
    ↓
Continue playback in new clip
```

### Path 3: Trim Clip → Update Timeline

```
TimelineRuler.tsx:handleMouseDown() (Line 183-237)
  → Detect trim handle click
  → setIsDragging({ type: 'clip-end', clipId })
    ↓
TimelineRuler.tsx:handleMouseMove() (Line 240-274)
  → Calculate new trim value
  → updateClipTrim(clipId, trimStart, newTrimEnd)
    ↓
videoStore.ts:updateClipTrim() (Line 235-275)
  → Validate trim values
  → Update clip's trimStart/trimEnd
  → recalculateStartTimes(clips)
  → calculateTotalDuration(clips)
  → Update store state
    ↓
TimelineRuler.tsx:canvas draw() (Line 52-180)
  → Re-render with new clip width
  → Adjust subsequent clip positions
    ↓
MediaPanel.tsx:ClipCard (Line 25-30, 277-280)
  → Show trimmed duration vs. full duration
  → Display "X:XX / Y:YY" format
```

### Path 4: Split Clip → Create Two Clips

```
TimelineRuler.tsx:handleSplitClip() (Line 44-49)
  → getCurrentClip()
  → splitClipAtTime(clipId, currentTime)
    ↓
videoStore.ts:splitClipAtTime() (Line 368-453)
  → Set isSplitting = true (shows spinner)
  → setTimeout(50ms) for UI update
  → Calculate split point in original video time
  → Create clip1 (start → splitPoint)
  → Create clip2 (splitPoint → end)
  → Both clips reference same file path & blobUrl
  → Replace original clip in array
  → recalculateStartTimes()
  → calculateTotalDuration()
  → setCurrentTime(splitTime)
  → Set isSplitting = false
    ↓
MediaPanel.tsx:render() (Line 340-354)
  → Two ClipCard components now shown
  → Thumbnails use different seekTime (trimStart)
    ↓
TimelineRuler.tsx:canvas draw() (Line 86-130)
  → Two clip blocks rendered
  → Gap between clips (visual separation)
```

### Path 5: Set PiP Track → Overlay Video

```
MediaPanel.tsx:ClipCard (Line 55-62)
  → User clicks PiP button
  → onSetPip(clip.id)
    ↓
videoStore.ts:setPipTrackFromClip() (Line 820-873)
  → Find clip by ID
  → Validate metadata loaded
  → Create Track object:
      - position: bottom-right (default)
      - volume: 0.5
      - offset: 0
      - duration: clip.duration * 1000
  → Set pipTrack state
    ↓
VideoPlayer.tsx:useEffect [pipTrack] (Line 105-134)
  → Load PiP video from clip.blobUrl
  → setPipVideoSrc(blobUrl)
    ↓
VideoPlayer.tsx:useEffect [pipVideoSrc, currentTime] (Line 136-167)
  → Calculate if PiP should be visible:
      pipStartTime ≤ currentTime < pipEndTime
  → Set pipVideo.currentTime = timeInPip
  → Sync play/pause with main video
    ↓
VideoPlayer.tsx:render() (Line 431-478)
  → Render second <video> element
  → Position based on pipTrack.position
  → Apply border, shadow styling
    ↓
PipControls.tsx:render() (Line 32-149)
  → Show floating control panel
  → Position, size, volume sliders
  → Remove PiP button
```

### Path 6: Record Video → Auto-Import

```
RecordingDialog.tsx:handleStartRecording() (Line 141-188)
  → Generate temp file path
  → invoke('start_screen_recording' or 'start_camera_recording')
  → Set isRecording = true
  → Start timer
    ↓
User clicks stop button
    ↓
RecordingDialog.tsx:handleStopRecording() (Line 191-242)
  → invoke('stop_screen_recording' or 'stop_camera_recording')
  → invoke('save_file_dialog', { defaultFilename })
  → invoke('move_file', { from: tempPath, to: savePath })
  → addClip(savePath, fileName)
  → Close dialog
    ↓
Follow Path 1 (Import Video → Display)
```

---

## Additional Features

### Keyboard Shortcuts
**File:** `/src/hooks/useKeyboardShortcuts.ts`

Provides keyboard controls for playback:
- **Space:** Play/Pause
- **Arrow Left/Right:** Seek backward/forward
- Implemented via `useEffect` with `keydown` event listeners

### Drag & Drop Import
**File:** `/src/components/DropZone.tsx`

- Listens to Tauri's `onDragDropEvent` API
- Validates file extensions (MP4, MOV)
- Prevents duplicate drops within 1 second
- Directly calls `addClip()` when file is dropped

### Export Functionality
**File:** `/src/components/ExportButton.tsx`, `/src/components/ExportDialog.tsx`

Not covered in detail here, but:
- Triggers Tauri backend video concatenation
- Supports PiP overlay rendering
- Progress tracking via Tauri events

---

## Memory Management Notes

### Blob URL Lifecycle
- **Created:** In `loadVideoBlob()` after fetching file bytes
- **Stored:** In `clip.blobUrl` field
- **Used:** By VideoPlayer's `<video src={blobUrl}>` and PiP video
- **Revoked:** In `removeClip()` via `URL.revokeObjectURL(clip.blobUrl)`

### Thumbnail Generation
- Temporary blobs created per thumbnail request
- Cleaned up after canvas extraction
- Final thumbnail stored as data URL (Base64 in memory)

### Potential Issues
- **Memory leak risk:** If clips are removed without revoking blob URLs
- **Mitigation:** `removeClip()` and `clearAllClips()` call `URL.revokeObjectURL()`
- **Large file handling:** Entire video loaded into memory as blob
  - Consider streaming or chunked loading for very large files

---

## Future Considerations

### Multi-Track Compositing
- Already present in store: `composite: CompositeState`
- Separate view mode: `CompositeEditorLayout.tsx`
- Tracks can be layered and played simultaneously
- Not yet integrated with sequential view export

### Performance Optimizations
- Lazy loading: Only load blob URLs for visible/active clips
- Thumbnail caching: Store generated thumbnails in IndexedDB
- Virtual scrolling: For MediaPanel with many clips

---

## Summary

ClipForge's sequential view architecture is well-structured with clear separation of concerns:

1. **State Management:** Zustand store acts as single source of truth
2. **Side Effects:** React hooks handle async operations (metadata loading, blob generation)
3. **UI Components:** Pure consumers of store state, trigger actions via callbacks
4. **Timeline Model:** Calculated from sequential clip positions with trimmed durations
5. **Playback:** Seamless clip transitions via smart video source switching
6. **Non-Destructive Editing:** Trim operations don't modify original files

**Key Strengths:**
- Predictable data flow
- Pre-loading strategy eliminates playback stutter
- Flexible clip manipulation (trim, split, reorder)
- PiP support for overlay videos
- Comprehensive timeline visualization

**Technical Debt:**
- Legacy `setVideo()`/`setMetadata()` methods for backward compatibility
- Potential memory issues with large video files (entire file in memory)
- Thumbnail generation could be cached

---

## Appendix: File Reference

| Component/Module | File Path | Lines of Interest |
|------------------|-----------|-------------------|
| **State Management** |
| Video Store | `/src/store/videoStore.ts` | 1-1040 (entire file) |
| Clip Interface | `/src/store/videoStore.ts` | 12-22 |
| Track Interface | `/src/types/clip.ts` | 27-54 |
| **Hooks** |
| Video Metadata Loader | `/src/hooks/useVideoMetadata.ts` | 17-136 |
| Video Thumbnail Generator | `/src/hooks/useVideoThumbnail.ts` | 11-242 |
| **Utilities** |
| Video Blob Loader | `/src/utils/videoLoader.ts` | 3-30 |
| **UI Components** |
| Main Layout | `/src/components/EditorLayout.tsx` | 19-105 |
| Media Panel | `/src/components/MediaPanel.tsx` | 287-360 |
| Clip Card | `/src/components/MediaPanel.tsx` | 19-284 |
| Video Player | `/src/components/VideoPlayer.tsx` | 13-554 |
| Timeline Ruler | `/src/components/TimelineRuler.tsx` | 6-383 |
| Import Button | `/src/components/ImportButton.tsx` | 8-83 |
| Record Dialog | `/src/components/RecordingDialog.tsx` | 45-515 |
| Drop Zone | `/src/components/DropZone.tsx` | 18-161 |
| PiP Controls | `/src/components/PipControls.tsx` | 5-152 |

---

**End of Document**
