# Multi-Track Architecture for Clip Compositing - PR Documentation

## Overview

ClipForge currently supports editing only a single imported clip at a time. This PR implements a **multi-track architecture** where each imported clip exists as a separate, independently-editable track that can be played back individually or composited together. Users can layer multiple clips, control properties per track (position, volume, opacity, z-order), and export composite outputs.

## Current State

### What Works Today
- ✅ Single clip import and basic editing
- ✅ Timeline trimming and preview playback
- ✅ Video export at multiple resolutions
- ✅ Camera and screen recording

### What's Missing
- ❌ Multiple clips remain non-functional (only first clip works)
- ❌ No track management UI (add, delete, reorder tracks)
- ❌ No per-track property controls (volume, opacity, position)
- ❌ No individual track playback
- ❌ No composite playback (all tracks together)
- ❌ No composite export (layering multiple clips)
- ❌ No track panel/timeline visualization for multi-track editing

## Proposed Architecture

### 1. Data Structures

#### Track Interface
```typescript
// src/types/clip.ts (NEW/UPDATED)
export interface Track {
  id: string;                          // Unique identifier (UUID)
  name: string;                        // Auto-generated: "Clip 1", "Clip 2", etc.
  clipData: ClipData;                  // The actual video/audio clip

  // Position & Layout
  position: {
    x: number;                         // Canvas X coordinate (pixels)
    y: number;                         // Canvas Y coordinate (pixels)
  };

  // Audio/Video Properties
  volume: number;                      // 0-1 range (default: 1)
  opacity: number;                     // 0-1 range (default: 1)

  // Track Ordering
  zIndex: number;                      // Layer depth (higher = on top)
  isVisible: boolean;                  // Show/hide track

  // Timeline
  offset: number;                      // Start time in milliseconds
  duration: number;                    // Clip duration in milliseconds

  // Metadata
  createdAt: Date;
  sourceFile?: string;                 // Original file path
}

export interface CompositeState {
  tracks: Track[];
  selectedTrackId?: string;            // Currently selected track for editing
  isPlayingComposite: boolean;         // Playing all tracks together
  currentTime: number;                 // Playhead position (ms)
}
```

#### Store Updates
```typescript
// src/store/videoStore.ts (UPDATED)
interface VideoState {
  // OLD - DEPRECATED
  // clipData: ClipData | null;

  // NEW
  composite: CompositeState;

  // Track Management Actions
  addTrack(clipData: ClipData): void;
  removeTrack(trackId: string): void;
  selectTrack(trackId: string): void;
  reorderTrack(trackId: string, newIndex: number): void;

  // Track Property Updates
  updateTrackProperty(trackId: string, property: keyof Track, value: any): void;
  updateTrackPosition(trackId: string, x: number, y: number): void;
  updateTrackVolume(trackId: string, volume: number): void;
  updateTrackOpacity(trackId: string, opacity: number): void;

  // Playback
  setCompositePlaybackState(isPlaying: boolean): void;
  setCurrentTime(time: number): void;
}
```

### 2. Component Changes

#### New Components

##### TrackPanel.tsx (New)
```typescript
// src/components/TrackPanel.tsx (NEW)
import React from 'react';
import { Box, List, ListItem, ListItemButton, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Delete, Visibility, VisibilityOff, DragIndicator } from '@mui/icons-material';
import { Track } from '../types/clip';

interface TrackPanelProps {
  tracks: Track[];
  selectedTrackId?: string;
  onSelectTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleVisibility: (trackId: string) => void;
  onReorderTrack: (trackId: string, newIndex: number) => void;
}

export function TrackPanel({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onDeleteTrack,
  onToggleVisibility,
  onReorderTrack
}: TrackPanelProps) {
  return (
    <Box sx={{
      width: 250,
      borderRight: '1px solid #ccc',
      p: 1,
      overflow: 'auto',
      maxHeight: '100%'
    }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
        Tracks ({tracks.length})
      </Typography>

      <List sx={{ p: 0 }}>
        {tracks.map((track, index) => (
          <ListItem
            key={track.id}
            disablePadding
            sx={{
              mb: 1,
              border: '1px solid #ddd',
              borderRadius: 1,
              backgroundColor: selectedTrackId === track.id ? '#e3f2fd' : 'transparent',
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' }
            }}
            draggable
            onDragStart={() => {}}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {}}
          >
            <ListItemButton
              onClick={() => onSelectTrack(track.id)}
              sx={{ flex: 1, p: 1 }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                <DragIndicator sx={{ fontSize: 18, color: '#999' }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {track.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {Math.round(track.duration / 1000)}s
                  </Typography>
                </Box>
              </Stack>
            </ListItemButton>

            <IconButton
              size="small"
              onClick={() => onToggleVisibility(track.id)}
              sx={{ mr: 0.5 }}
            >
              {track.isVisible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
            </IconButton>

            <IconButton
              size="small"
              onClick={() => onDeleteTrack(track.id)}
              color="error"
            >
              <Delete fontSize="small" />
            </IconButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
```

##### TrackPropertiesPanel.tsx (New)
```typescript
// src/components/TrackPropertiesPanel.tsx (NEW)
import React from 'react';
import { Box, Slider, Typography, Stack, Switch, FormControlLabel } from '@mui/material';
import { Track } from '../types/clip';

interface TrackPropertiesPanelProps {
  track: Track | undefined;
  onUpdatePosition: (x: number, y: number) => void;
  onUpdateVolume: (volume: number) => void;
  onUpdateOpacity: (opacity: number) => void;
  onUpdateVisibility: (visible: boolean) => void;
}

export function TrackPropertiesPanel({
  track,
  onUpdatePosition,
  onUpdateVolume,
  onUpdateOpacity,
  onUpdateVisibility
}: TrackPropertiesPanelProps) {
  if (!track) {
    return (
      <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
        <Typography variant="body2">Select a track to edit properties</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, width: 250, borderLeft: '1px solid #ccc', overflow: 'auto' }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
        Properties: {track.name}
      </Typography>

      {/* Visibility */}
      <FormControlLabel
        control={
          <Switch
            checked={track.isVisible}
            onChange={(e) => onUpdateVisibility(e.target.checked)}
          />
        }
        label="Visible"
        sx={{ mb: 2 }}
      />

      {/* Volume */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="body2">Volume: {Math.round(track.volume * 100)}%</Typography>
        <Slider
          value={track.volume}
          onChange={(_, value) => onUpdateVolume(value as number)}
          min={0}
          max={1}
          step={0.01}
        />
      </Stack>

      {/* Opacity */}
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="body2">Opacity: {Math.round(track.opacity * 100)}%</Typography>
        <Slider
          value={track.opacity}
          onChange={(_, value) => onUpdateOpacity(value as number)}
          min={0}
          max={1}
          step={0.01}
        />
      </Stack>

      {/* Position */}
      <Stack spacing={1}>
        <Typography variant="body2">Position</Typography>
        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">X: {track.position.x}px</Typography>
            <Slider
              value={track.position.x}
              onChange={(_, value) => onUpdatePosition(value as number, track.position.y)}
              min={-500}
              max={500}
              step={1}
              size="small"
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption">Y: {track.position.y}px</Typography>
            <Slider
              value={track.position.y}
              onChange={(_, value) => onUpdatePosition(track.position.x, value as number)}
              min={-500}
              max={500}
              step={1}
              size="small"
            />
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
```

#### Updated Components

##### Canvas.tsx (Updated)
```typescript
// src/components/Canvas.tsx (UPDATED)
// Render all visible tracks composited together

export function Canvas({ composite }: { composite: CompositeState }) {
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#000' }}>
      {composite.tracks
        .filter(t => t.isVisible)
        .sort((a, b) => a.zIndex - b.zIndex)  // Render in z-order
        .map(track => (
          <Box
            key={track.id}
            sx={{
              position: 'absolute',
              left: track.position.x,
              top: track.position.y,
              opacity: track.opacity,
              cursor: 'move',
              border: selectedTrackId === track.id ? '2px solid blue' : 'none'
            }}
            onClick={() => onSelectTrack(track.id)}
            onMouseDown={(e) => handleTrackDrag(e, track.id)}
          >
            <video
              src={track.clipData.path}
              style={{
                width: track.clipData.width,
                height: track.clipData.height,
              }}
            />
          </Box>
        ))}
    </Box>
  );
}
```

##### Timeline.tsx (Updated)
```typescript
// src/components/Timeline.tsx (UPDATED)
// Show all tracks stacked vertically with individual playback controls

export function Timeline({ composite, onSelectTrack }: TimelineProps) {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      p: 1,
      backgroundColor: '#f5f5f5',
      overflow: 'auto'
    }}>
      {composite.tracks.map(track => (
        <TrackTimeline
          key={track.id}
          track={track}
          isSelected={composite.selectedTrackId === track.id}
          onSelect={() => onSelectTrack(track.id)}
        />
      ))}
    </Box>
  );
}
```

### 3. Hook Updates

#### useMultiTrack.ts (New)
```typescript
// src/hooks/useMultiTrack.ts (NEW)
import { useCallback } from 'react';
import { useVideoStore } from '../store/videoStore';
import { v4 as uuidv4 } from 'uuid';
import { ClipData, Track } from '../types/clip';

export function useMultiTrack() {
  const store = useVideoStore();
  const { composite } = store;

  const addTrack = useCallback((clipData: ClipData) => {
    const newTrack: Track = {
      id: uuidv4(),
      name: `Clip ${composite.tracks.length + 1}`,
      clipData,
      position: { x: 0, y: composite.tracks.length * 50 },
      volume: 1,
      opacity: 1,
      zIndex: composite.tracks.length,
      isVisible: true,
      offset: 0,
      duration: clipData.duration,
      createdAt: new Date(),
      sourceFile: clipData.path
    };

    store.addTrack(clipData); // Store action will handle adding
  }, [composite.tracks.length, store]);

  const removeTrack = useCallback((trackId: string) => {
    store.removeTrack(trackId);
  }, [store]);

  const updateTrackProperty = useCallback((
    trackId: string,
    property: keyof Track,
    value: any
  ) => {
    store.updateTrackProperty(trackId, property, value);
  }, [store]);

  const playTrack = useCallback((trackId: string) => {
    // Play individual track
    const track = composite.tracks.find(t => t.id === trackId);
    if (track) {
      // Implementation: Start playback of this track's video/audio
    }
  }, [composite.tracks]);

  const playComposite = useCallback(() => {
    // Play all visible tracks together
    store.setCompositePlaybackState(true);
  }, [store]);

  return {
    tracks: composite.tracks,
    selectedTrackId: composite.selectedTrackId,
    addTrack,
    removeTrack,
    playTrack,
    playComposite,
    updateTrackProperty
  };
}
```

#### useAudioMixing.ts (New)
```typescript
// src/hooks/useAudioMixing.ts (NEW)
import { useEffect, useRef } from 'react';
import { Track } from '../types/clip';

export function useAudioMixing(tracks: Track[]) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    // Initialize Web Audio API for mixing
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioContext = audioContextRef.current;

    // For each track, create audio sources and set volume
    tracks.forEach(track => {
      // Load audio from track.clipData
      // Apply track.volume
      // Connect to audio context destination
    });

    return () => {
      // Cleanup audio sources
    };
  }, [tracks]);

  const playMix = useCallback(() => {
    // Start playback of all audio sources
  }, []);

  const stopMix = useCallback(() => {
    // Stop all audio sources
  }, []);

  return { playMix, stopMix };
}
```

## Implementation Phases

### Phase 1: Core Data Structure & Store (3-4 hours)
**Goal:** Refactor clip storage from single to multi-track array

#### Tasks:
1. **Create Track interface and types** (45 min)
   - Define Track, CompositeState interfaces
   - Add utility functions (generateTrackName, createTrackId)
   - Update ClipData type if needed

2. **Refactor videoStore** (90 min)
   - Replace single `clipData` with `composite: CompositeState`
   - Implement all track management actions (add, remove, select, reorder)
   - Implement property update actions (volume, opacity, position)
   - Maintain backward compatibility where possible
   - Update all store selectors

3. **Create useMultiTrack hook** (45 min)
   - Implement track CRUD operations
   - Implement individual and composite playback methods
   - Handle track selection logic

4. **Migration helper** (30 min)
   - Create script to convert existing single clip to Track array
   - Ensure existing imports still work as first track

### Phase 2: UI Components (4-5 hours)
**Goal:** Build track management and editing UI

#### Tasks:
1. **TrackPanel component** (90 min)
   - Display list of all tracks
   - Implement track selection
   - Add delete buttons
   - Implement visibility toggles
   - Support drag-to-reorder (basic implementation)

2. **TrackPropertiesPanel component** (60 min)
   - Build volume slider
   - Build opacity slider
   - Build position X/Y sliders
   - Wire up callbacks to store

3. **Update Canvas component** (90 min)
   - Render all visible tracks with correct z-ordering
   - Support track dragging on canvas
   - Highlight selected track
   - Display clip boundaries

4. **Update Timeline component** (75 min)
   - Stack tracks vertically
   - Show individual track controls
   - Display track duration and offset
   - Click to select track

5. **Layout restructuring** (45 min)
   - Update main layout to include TrackPanel (left), Canvas (center), PropertiesPanel (right)
   - Ensure responsive design
   - Handle collapsed/expanded states

### Phase 3: Playback & Audio Mixing (3-4 hours)
**Goal:** Implement individual and composite playback

#### Tasks:
1. **Create useAudioMixing hook** (90 min)
   - Initialize Web Audio API context
   - Load audio from each track
   - Apply per-track volume
   - Mix all audio to single output
   - Handle audio synchronization

2. **Update video playback engine** (75 min)
   - Refactor to support multiple video elements
   - Implement frame-accurate playback across tracks
   - Handle audio/video sync for composite

3. **Individual track playback** (60 min)
   - Implement solo button per track
   - Preview single track's audio and video
   - Handle UI state during playback

4. **Composite playback** (45 min)
   - Play all visible tracks together
   - Handle different track durations
   - Update playhead position across all tracks

### Phase 4: Export & Composite Rendering (4-5 hours)
**Goal:** Composite and export all tracks

#### Tasks:
1. **Composite rendering pipeline** (90 min)
   - Use FFmpeg to composite all tracks
   - Apply per-track volume, opacity, position
   - Mix audio from all tracks
   - Output single video file

2. **Update export dialog** (45 min)
   - Show track composition options
   - Allow selection of which tracks to export
   - Display estimated file size with all tracks

3. **Backend FFmpeg commands** (90 min)
   - Create Rust command for multi-track compositing
   - Build FFmpeg filter graph for layering
   - Handle audio mixing in FFmpeg
   - Test at various resolutions

4. **Performance optimization** (45 min)
   - Profile export performance
   - Optimize FFmpeg encoding settings
   - Consider hardware acceleration

### Phase 5: Bug Fixes & Refinement (2-3 hours)
**Goal:** Address current issues and polish

#### Tasks:
1. **Fix "only first clip works" bug** (45 min)
   - Debug clip loading pipeline
   - Ensure all clips register properly
   - Test with 5+ clips

2. **UI/UX refinement** (60 min)
   - Visual feedback for track operations
   - Keyboard shortcuts (delete track, etc.)
   - Undo/redo for track operations (optional)

3. **Testing** (45 min)
   - Test adding/removing tracks
   - Test property updates
   - Test playback with multiple tracks
   - Cross-platform testing (macOS/Windows)

## File Structure Changes

```
src/
├── types/
│   ├── clip.ts (UPDATED)              // Add Track, CompositeState
│
├── components/
│   ├── TrackPanel.tsx (NEW)           // Track list and management
│   ├── TrackPropertiesPanel.tsx (NEW) // Track property controls
│   ├── Canvas.tsx (UPDATED)           // Render all visible tracks
│   ├── Timeline.tsx (UPDATED)         // Multi-track timeline
│   └── TrackTimeline.tsx (NEW)        // Individual track timeline row
│
├── hooks/
│   ├── useMultiTrack.ts (NEW)         // Track management
│   ├── useAudioMixing.ts (NEW)        // Audio mixing logic
│   └── usePlayback.ts (UPDATED)       // Support multiple tracks
│
├── store/
│   └── videoStore.ts (UPDATED)        // Multi-track state management
│
└── utils/
    └── trackUtils.ts (NEW)             // Helper functions

src-tauri/
└── src/
    ├── main.rs (UPDATED)              // Add composite export command
    └── ffmpeg.rs (NEW/UPDATED)        // FFmpeg composite rendering
```

## User Experience Flow

### Scenario 1: Import Second Clip
```
1. User has one clip imported (Clip 1) displayed on canvas
2. Clicks "Import" and selects second video file
3. Second clip is added as "Clip 2" to track panel
4. Appears on canvas at default position (overlapping first clip)
5. User can select Clip 2 and adjust opacity/position to see both
```

### Scenario 2: Create Picture-in-Picture Effect
```
1. User imports two clips (Clip 1: main video, Clip 2: secondary)
2. Clip 1 is at position (0, 0) with opacity 1.0, zIndex 0
3. User selects Clip 2 in track panel
4. Adjusts position to (400, 300) for lower-right corner
5. Adjusts opacity to 0.8 for slight transparency
6. Adjusts zIndex to 1 (on top of Clip 1)
7. Plays composite to preview - sees both clips together
8. Exports at selected resolution with both clips composited
```

### Scenario 3: Reduce Volume on Secondary Track
```
1. User has background music in Clip 1, main audio in Clip 2
2. Selects Clip 1 in track panel
3. Adjusts volume slider to 0.5 (50% volume)
4. Plays composite - hears both audio streams mixed with Clip 1 quieter
5. Exports - resulting file has both audio tracks mixed appropriately
```

### Scenario 4: Delete Unused Track
```
1. User imported wrong clip as Clip 3
2. Selects Clip 3 in track panel
3. Clicks delete button
4. Track is removed, other clips remain intact
5. Track count updates to show 2 tracks
```

## Success Criteria

- ✅ All imported clips are properly registered and functional
- ✅ Can view all clips on canvas simultaneously
- ✅ Can select individual tracks in track panel
- ✅ Can adjust volume per track (0-100%)
- ✅ Can adjust opacity per track (0-100%)
- ✅ Can reposition clips on canvas via drag or sliders
- ✅ Can reorder tracks (change z-index)
- ✅ Can delete tracks
- ✅ Can toggle visibility per track
- ✅ Can play individual track for preview
- ✅ Can play composite (all tracks together)
- ✅ Audio from all tracks mixes correctly (simple mix, no crossfading)
- ✅ Can export composite file with all visible tracks
- ✅ Exported file dimensions match export resolution setting
- ✅ No performance degradation with 5+ tracks
- ✅ Works on macOS and Windows

## Performance Considerations

### Playback Performance
- **1-3 tracks**: Smooth playback, minimal CPU impact
- **4-8 tracks**: May see ~10-20% CPU usage, monitor for frame drops
- **9+ tracks**: Consider warning user about performance impact

### Memory Usage
- Each track loads clip data into memory
- Estimate ~1-2MB per second of video at 1080p
- Consider streaming/chunked loading for long clips (future enhancement)

### Export Performance
- Compositing multiple tracks in FFmpeg is CPU-bound
- 2-track composite: ~2x encoding time vs single track
- Audio mixing adds ~10-15% overhead
- Consider hardware acceleration (NVENC, QuickSync) for future

## References & Related PRDs

- Video Import: `docs/PRD-02-Video-Import.md`
- Preview Player: `docs/PRD-03-Preview-Player.md`
- Timeline Trim: `docs/PRD-04-Timeline-Trim.md`
- Video Export: `docs/PRD-05-Video-Export.md`
- Multiple Resolutions: `docs/PR_MULTIPLE_RESOLUTIONS.md`

## Open Questions

1. **Should track order affect layering?** (Proposed: Yes, index 0 at bottom, last at top)
2. **What's max recommended tracks?** (Proposed: Warn at 10+ tracks, no hard limit)
3. **Should we support audio-only tracks?** (Proposed: MVP video + audio only, audio-only future)
4. **Undo/redo for track operations?** (Proposed: Post-MVP enhancement)
5. **Track grouping/nesting?** (Proposed: Future feature for complex compositions)
6. **Keyframe-based animation per track?** (Proposed: Future enhancement)

## Notes

This feature addresses the core issue of non-functional multiple clips and provides the foundation for advanced composition workflows. The implementation is structured to allow future enhancements like effects per track, keyframe animations, and track grouping.

The audio mixing strategy uses Web Audio API for playback preview and FFmpeg for final export, ensuring consistent results between preview and output. Simple mixing (no crossfading) means all audio tracks play at full volume unless adjusted via per-track volume slider.

Track z-ordering is based on array index (first track lowest, last track highest) combined with explicit zIndex property for future flexibility.
