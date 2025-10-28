# Multi-Track Memory Optimization - PR Documentation

## Problem Statement

The current multi-track compositing system loads **entire video files into memory** for each track, causing severe memory scaling issues:

```
Current Architecture:
Track 1: Full video file (500MB) + video element + decoder
Track 2: Full video file (500MB) + video element + decoder
Track 3: Full video file (500MB) + video element + decoder

Memory Usage: O(N × FileSize)
- 5 tracks × 500MB = 2.5GB RAM
- 10 tracks × 500MB = 5GB RAM
- 20 tracks × 500MB = 10GB RAM
```

### Root Cause

In `src/components/CompositeCanvas.tsx` (lines 64-128), the video loading pipeline:

1. Calls Tauri `get_video_file` which reads **entire file** into memory
2. Creates a Blob from full file bytes
3. Creates blob URL via `URL.createObjectURL()`
4. Each track maintains its own video element

This architecture creates **one complete video copy per track** in RAM.

## Goals

1. **Reduce memory usage** from O(N × FileSize) to O(FileSize) or better
2. **Maintain playback performance** - no perceivable degradation
3. **Preserve existing features** - all track controls still work
4. **Gradual implementation** - can be rolled out in phases

## Proposed Solution: Lazy Loading + Streaming

Implement a three-tier optimization strategy:

### Tier 1: Lazy Loading (Quick Win)
Only load video data when track becomes visible

### Tier 2: Streaming Architecture
Stream video from disk instead of loading entire file

### Tier 3: Canvas Compositing (Future)
Replace multiple video elements with single canvas renderer

---

## Implementation Plan

This PR focuses on **Tier 1 (Lazy Loading)** and **Tier 2 (Streaming)** as they provide the best ROI for complexity.

---

## Phase 1: Lazy Loading (3-4 hours)

**Goal**: Only load videos for visible tracks, unload hidden tracks

### Step 1.1: Add Loading State Tracking (45 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**:
1. Add new state to track which videos should be loaded
2. Separate "visibility" from "loaded"

**Code changes**:

```typescript
// Add this new state near line 50
const [loadedVideoIds, setLoadedVideoIds] = useState<Set<string>>(new Set());
const [isLoadingVideo, setIsLoadingVideo] = useState<Map<string, boolean>>(new Map());

// Add this helper to determine if video should be loaded
const shouldLoadVideo = useCallback((track: Track) => {
  return track.isVisible; // Only load visible tracks
}, []);
```

**Why**: We need to distinguish between "should show" vs "has data loaded"

---

### Step 1.2: Modify Video Loading Logic (90 min)

**File**: `src/components/CompositeCanvas.tsx`

**Current code** (lines 87-128):
```typescript
const loadNewTracks = async () => {
  for (const track of tracks) {
    if (loadedTrackIdsRef.current.has(track.id)) continue;
    // Loads ALL tracks regardless of visibility
  }
};
```

**Replace with**:
```typescript
const loadNewTracks = async () => {
  for (const track of tracks) {
    // Skip if already loaded
    if (loadedTrackIdsRef.current.has(track.id)) continue;

    // NEW: Only load visible tracks
    if (!shouldLoadVideo(track)) {
      console.log('[CompositeCanvas] Skipping hidden track:', track.id);
      continue;
    }

    // Mark as loading
    setIsLoadingVideo(prev => new Map(prev).set(track.id, true));
    loadedTrackIdsRef.current.add(track.id);

    try {
      // ... existing Tauri invoke code ...

      setVideoSources(prevSources => {
        const updated = new Map(prevSources);
        updated.set(track.id, blobUrl);
        return updated;
      });

      console.log('[CompositeCanvas] Loaded video for track:', track.id);
    } catch (e) {
      console.error('[CompositeCanvas] Failed to load video:', track.id, e);
      loadedTrackIdsRef.current.delete(track.id);
    } finally {
      setIsLoadingVideo(prev => {
        const updated = new Map(prev);
        updated.delete(track.id);
        return updated;
      });
    }
  }
};
```

**Why**: This ensures we only allocate memory for visible tracks

---

### Step 1.3: Add Video Unloading (60 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**: Create a new effect that unloads videos when tracks become hidden

**Add after the loading effect**:

```typescript
// Unload videos for hidden tracks
useEffect(() => {
  const unloadHiddenTracks = () => {
    const currentTrackMap = new Map(tracks.map(t => [t.id, t]));

    videoSources.forEach((url, trackId) => {
      const track = currentTrackMap.get(trackId);

      // Unload if track is hidden
      if (track && !shouldLoadVideo(track)) {
        console.log('[CompositeCanvas] Unloading hidden track:', trackId);

        // Revoke blob URL to free memory
        URL.revokeObjectURL(url);

        // Remove from state
        setVideoSources(prev => {
          const updated = new Map(prev);
          updated.delete(trackId);
          return updated;
        });

        // Remove from loaded set
        loadedTrackIdsRef.current.delete(trackId);

        // Remove video element reference
        videoRefsMap.current.delete(trackId);
      }
    });
  };

  unloadHiddenTracks();
}, [tracks, videoSources, shouldLoadVideo]);
```

**Why**: This frees memory when tracks are hidden via the visibility toggle

---

### Step 1.4: Add Re-loading on Visibility Change (45 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**: Trigger loading when a hidden track becomes visible again

**Modify the main loading effect**:

```typescript
useEffect(() => {
  const currentTrackIds = new Set(tracks.map(t => t.id));

  // Clean up removed tracks (existing code)
  setVideoSources(prevSources => {
    // ... existing cleanup code ...
  });

  // Load new OR newly-visible tracks
  const loadNewTracks = async () => {
    for (const track of tracks) {
      const isLoaded = loadedTrackIdsRef.current.has(track.id);
      const isVisible = shouldLoadVideo(track);

      // Load if: visible AND not loaded
      if (isVisible && !isLoaded) {
        // ... existing loading code ...
      }
    }
  };

  loadNewTracks();
}, [tracks, shouldLoadVideo]); // Add shouldLoadVideo to dependencies
```

**Why**: Users expect hidden tracks to reappear when toggled visible

---

### Step 1.5: Update Rendering Logic (30 min)

**File**: `src/components/CompositeCanvas.tsx`

**Current code** (lines 330-410):
```typescript
{visibleTracks.map((track) => {
  const videoSrc = videoSources.get(track.id);
  // ...
})}
```

**Add loading state indicator**:

```typescript
{visibleTracks.map((track) => {
  const videoSrc = videoSources.get(track.id);
  const isSelected = selectedTrackId === track.id;
  const isLoading = isLoadingVideo.get(track.id);

  return (
    <Box key={track.id} /* ... existing sx ... */>
      {videoSrc ? (
        <video /* ... existing props ... */ />
      ) : (
        <Box sx={{
          width: track.clipData.width,
          height: track.clipData.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }}>
          <Typography variant="caption" color="text.secondary">
            {isLoading ? 'Loading...' : 'Hidden'}
          </Typography>
        </Box>
      )}
    </Box>
  );
})}
```

**Why**: Provides visual feedback during load/unload operations

---

### Testing Phase 1

**Test cases**:
1. Import 5 clips → Verify all 5 load (all visible by default)
2. Hide track 3 → Verify blob URL revoked, memory freed
3. Show track 3 again → Verify video reloads correctly
4. Import 10 clips, hide 8 → Verify only 2 videos in memory
5. Play composite with mixed visibility → Verify only visible tracks play

**Expected memory savings**:
- 10 tracks, 8 hidden: **4GB saved** (80% reduction)
- 20 tracks, 15 hidden: **7.5GB saved** (75% reduction)

---

## Phase 2: Streaming Architecture (5-6 hours)

**Goal**: Stream video from disk instead of loading entire file into memory

### Step 2.1: Create Tauri Streaming Command (120 min)

**File**: `src-tauri/src/lib.rs`

**What to do**: Add new Tauri command that returns file path instead of bytes

**Add this new command**:

```rust
#[tauri::command]
fn get_video_file_path(video_path: String) -> Result<String, String> {
    // Validate path exists
    let path = std::path::Path::new(&video_path);
    if !path.exists() {
        return Err(format!("Video file not found: {}", video_path));
    }

    // Return absolute path
    match path.canonicalize() {
        Ok(canonical_path) => Ok(canonical_path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to resolve path: {}", e))
    }
}
```

**Register the command** in `lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_video_file,
            get_video_file_path,  // Add this line
            // ... other commands ...
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Why**: We need file paths to use with HTML5 video's native streaming

---

### Step 2.2: Add Protocol Handler for Local Files (90 min)

**File**: `src-tauri/src/lib.rs`

**What to do**: Register a custom protocol to serve video files with proper headers

**Add this before `tauri::Builder`**:

```rust
use tauri::Manager;

fn setup_video_protocol(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle();

    app.asset_protocol("video", move |request| {
        // Extract file path from URL
        let uri = request.uri();
        let path = uri.path().trim_start_matches('/');

        // Read file
        match std::fs::read(path) {
            Ok(data) => {
                tauri::http::ResponseBuilder::new()
                    .header("Content-Type", "video/mp4")
                    .header("Accept-Ranges", "bytes")
                    .body(data)
            },
            Err(e) => {
                tauri::http::ResponseBuilder::new()
                    .status(404)
                    .body(format!("File not found: {}", e).into_bytes())
            }
        }
    });

    Ok(())
}
```

**Register in builder**:

```rust
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            setup_video_protocol(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        // ... rest of builder ...
}
```

**Why**: Allows video elements to stream directly from file system with range requests

---

### Step 2.3: Update Frontend to Use Streaming (75 min)

**File**: `src/components/CompositeCanvas.tsx`

**Current code** (lines 103-117):
```typescript
const videoBytes = (await invoke('get_video_file', {
  videoPath: track.clipData.path
})) as number[];

const uint8Array = new Uint8Array(videoBytes);
const blob = new Blob([uint8Array], { type: 'video/mp4' });
const blobUrl = URL.createObjectURL(blob);
```

**Replace with**:

```typescript
// Check if custom protocol is available
const supportsVideoProtocol = window.__TAURI_INVOKE__ !== undefined;

let videoUrl: string;

if (supportsVideoProtocol) {
  // Use streaming via custom protocol
  const filePath = (await invoke('get_video_file_path', {
    videoPath: track.clipData.path
  })) as string;

  videoUrl = `video://${filePath}`;
  console.log('[CompositeCanvas] Using streaming for track:', track.id);
} else {
  // Fallback to blob loading (old method)
  const videoBytes = (await invoke('get_video_file', {
    videoPath: track.clipData.path
  })) as number[];

  const uint8Array = new Uint8Array(videoBytes);
  const blob = new Blob([uint8Array], { type: 'video/mp4' });
  videoUrl = URL.createObjectURL(blob);
  console.log('[CompositeCanvas] Using blob for track:', track.id);
}

setVideoSources(prevSources => {
  const updated = new Map(prevSources);
  updated.set(track.id, videoUrl);
  return updated;
});
```

**Why**: Uses native file streaming when available, falls back to blob for compatibility

---

### Step 2.4: Update Cleanup Logic (45 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**: Only revoke blob URLs, not custom protocol URLs

**Update cleanup effect** (around line 131):

```typescript
useEffect(() => {
  const currentSources = new Map(videoSources);
  return () => {
    console.log('[CompositeCanvas] Component unmounting, cleaning up blob URLs');
    currentSources.forEach((url) => {
      // Only revoke blob URLs, not custom protocol URLs
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  };
}, []);
```

**Why**: Custom protocol URLs don't need revoking and would error if attempted

---

### Step 2.5: Add Memory Usage Monitoring (60 min)

**File**: `src/hooks/useMemoryMonitor.ts` (NEW)

**What to do**: Create hook to track memory usage and warn users

```typescript
import { useEffect, useState } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export function useMemoryMonitor() {
  const [memoryUsage, setMemoryUsage] = useState<MemoryInfo | null>(null);
  const [isHighMemory, setIsHighMemory] = useState(false);

  useEffect(() => {
    // Check if performance.memory is available (Chromium only)
    if (!('memory' in performance)) {
      console.warn('[MemoryMonitor] performance.memory not available');
      return;
    }

    const checkMemory = () => {
      const memory = (performance as any).memory as MemoryInfo;
      setMemoryUsage(memory);

      // Warn if using >80% of heap limit
      const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      setIsHighMemory(usagePercent > 80);

      if (usagePercent > 80) {
        console.warn('[MemoryMonitor] High memory usage:', usagePercent.toFixed(1), '%');
      }
    };

    // Check every 5 seconds
    const interval = setInterval(checkMemory, 5000);
    checkMemory(); // Initial check

    return () => clearInterval(interval);
  }, []);

  const formatMemory = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return {
    memoryUsage,
    isHighMemory,
    formatMemory
  };
}
```

**Why**: Helps developers and users understand memory impact

---

### Step 2.6: Display Memory Warning (45 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**: Show warning banner when memory is high

**Add at top of component**:

```typescript
import { useMemoryMonitor } from '../hooks/useMemoryMonitor';

export function CompositeCanvas({ /* ... */ }) {
  const { isHighMemory, memoryUsage, formatMemory } = useMemoryMonitor();

  // ... rest of component ...
```

**Add warning banner before canvas container** (around line 287):

```typescript
{isHighMemory && memoryUsage && (
  <Box sx={{
    backgroundColor: 'warning.main',
    color: 'warning.contrastText',
    p: 1,
    textAlign: 'center'
  }}>
    <Typography variant="body2">
      ⚠️ High memory usage: {formatMemory(memoryUsage.usedJSHeapSize)} / {formatMemory(memoryUsage.jsHeapSizeLimit)}
      {' - Consider hiding unused tracks'}
    </Typography>
  </Box>
)}
```

**Why**: Users should know when they're approaching memory limits

---

### Testing Phase 2

**Test cases**:
1. Import 5 clips with streaming enabled → Verify memory usage is low
2. Compare memory usage: blob vs streaming (should see 90%+ reduction)
3. Scrub through video → Verify streaming works smoothly
4. Play/pause with 10 tracks → Verify no performance degradation
5. Test on low-memory device (4GB RAM) → Verify warning appears appropriately

**Expected memory savings**:
- Streaming: **~95% reduction** vs blob loading
- 10 tracks × 500MB: 5GB → **~250MB** (just decoders + buffers)

---

## Phase 3: Additional Optimizations (2-3 hours)

### Step 3.1: Implement Preview-Quality Loading (60 min)

**Goal**: Load lower resolution version for preview, full resolution for export

**File**: `src-tauri/src/lib.rs`

**Add new command**:

```rust
#[tauri::command]
fn get_video_preview_path(video_path: String, quality: String) -> Result<String, String> {
    // Generate preview in temp directory if not exists
    // Use FFmpeg to create 720p proxy if original is 4K
    // Cache preview files

    // Implementation details:
    // 1. Check if preview exists in cache
    // 2. If not, generate with: ffmpeg -i input.mp4 -vf scale=-1:720 preview.mp4
    // 3. Return preview path

    todo!("Implement preview generation")
}
```

**Why**: 4K videos use 4x memory vs 1080p, preview doesn't need full resolution

---

### Step 3.2: Add Preload Strategy (45 min)

**File**: `src/components/CompositeCanvas.tsx`

**What to do**: Add `preload` attribute to control video loading behavior

**Modify video element** (around line 359):

```typescript
<video
  ref={getRefCallback(track.id)}
  src={videoSrc}
  preload="metadata"  // Add this - only loads metadata, not full video
  loop={false}
  muted={true}
  style={{
    display: 'block',
    width: track.clipData.width,
    height: track.clipData.height,
    pointerEvents: 'none'
  }}
  onLoadedMetadata={(e) => {
    const video = e.currentTarget;
    video.currentTime = currentTime / 1000;
  }}
/>
```

**Why**: `preload="metadata"` prevents browser from buffering entire video until play

---

### Step 3.3: Implement Track Prioritization (60 min)

**File**: `src/hooks/useTrackPriority.ts` (NEW)

**What to do**: Load tracks in priority order (selected > visible > hidden)

```typescript
import { useMemo } from 'react';
import { Track } from '../types/clip';

export function useTrackPriority(
  tracks: Track[],
  selectedTrackId?: string
) {
  return useMemo(() => {
    const prioritized: Track[] = [];

    // Priority 1: Selected track
    const selected = tracks.find(t => t.id === selectedTrackId);
    if (selected && selected.isVisible) {
      prioritized.push(selected);
    }

    // Priority 2: Other visible tracks
    const otherVisible = tracks.filter(
      t => t.isVisible && t.id !== selectedTrackId
    );
    prioritized.push(...otherVisible);

    // Priority 3: Hidden tracks (don't load)
    const hidden = tracks.filter(t => !t.isVisible);
    prioritized.push(...hidden);

    return prioritized;
  }, [tracks, selectedTrackId]);
}
```

**Use in CompositeCanvas**:

```typescript
const prioritizedTracks = useTrackPriority(tracks, selectedTrackId);

// Use prioritizedTracks instead of tracks in loading loop
```

**Why**: Ensures most important tracks (selected, visible) load first

---

## Expected Performance Improvements

### Memory Usage Comparison

| Scenario | Before | After Phase 1 | After Phase 2 |
|----------|--------|---------------|---------------|
| 5 tracks (all visible) | 2.5GB | 2.5GB | **~120MB** |
| 10 tracks (5 hidden) | 5GB | **2.5GB** | **~120MB** |
| 20 tracks (15 hidden) | 10GB | **2.5GB** | **~120MB** |
| 10 tracks (4K video) | 12GB | 12GB | **~300MB** |

### CPU Usage

- No significant change in CPU usage
- Streaming may reduce initial load time by 50-80%
- Playback performance should remain identical

### Loading Times

- **Phase 1**: Faster perceived load (only loads visible)
- **Phase 2**: Near-instant load (no file copying)

---

## Migration Guide

These changes are **100% backward compatible**:

1. Existing blob loading remains as fallback
2. Streaming is opt-in via protocol registration
3. All existing features continue to work
4. No changes to data structures or APIs

### For Developers

**No action required** - changes are internal to `CompositeCanvas.tsx`

### For Users

**No visible changes** except:
- Faster load times
- Lower memory usage
- Warning banner if memory is high

---

## Testing Checklist

### Phase 1 (Lazy Loading)
- [ ] Import 10 clips, all load correctly
- [ ] Hide 5 tracks, memory usage drops by ~2.5GB
- [ ] Show hidden track, it reloads correctly
- [ ] Play composite with mixed visibility, only visible tracks play
- [ ] Delete hidden track, no errors occur

### Phase 2 (Streaming)
- [ ] Streaming command returns valid file path
- [ ] Video protocol serves video data correctly
- [ ] Video element can stream from custom protocol
- [ ] Scrubbing works smoothly with streaming
- [ ] Memory usage is <500MB with 10 tracks
- [ ] Playback quality is identical to blob method
- [ ] Works on macOS and Windows

### Phase 3 (Optimizations)
- [ ] Preview quality reduces memory by additional 50%
- [ ] `preload="metadata"` reduces initial load
- [ ] Track prioritization loads selected track first
- [ ] Memory warning appears at 80% heap usage

---

## Rollout Strategy

### Week 1: Phase 1 (Lazy Loading)
- Implement lazy loading
- Test with team
- Gather feedback on load/unload behavior

### Week 2: Phase 2 (Streaming)
- Add Tauri commands
- Implement protocol handler
- Test on multiple platforms
- Performance benchmarking

### Week 3: Phase 3 (Optimizations)
- Add preview quality
- Implement prioritization
- Final polish and testing

### Week 4: Release
- Documentation
- Release notes
- Monitor for issues

---

## Future Enhancements (Post-MVP)

### Canvas Compositing (Phase 4)
Replace multiple video elements with single canvas + OffscreenCanvas for rendering

**Benefits**:
- Reduces to O(1) video elements regardless of track count
- Enables advanced effects (transitions, filters)
- Better control over frame timing

**Complexity**: High - requires rewriting entire rendering pipeline

### WebCodecs API (Phase 5)
Use WebCodecs for direct video decode without video elements

**Benefits**:
- Ultimate memory efficiency
- Frame-perfect synchronization
- Eliminates browser decode overhead

**Complexity**: Very High - cutting edge API with limited browser support

### Chunk-Based Loading (Phase 6)
Only load time ranges currently visible in timeline

**Benefits**:
- Enables 2+ hour timelines without memory issues
- Reduces initial load time to near-zero

**Complexity**: High - requires time-based seeking logic

---

## Success Metrics

### Primary Goals
- ✅ **Memory usage** reduced by 80%+ for typical use cases
- ✅ **Loading time** reduced by 50%+
- ✅ **No degradation** in playback performance

### Secondary Goals
- ✅ **Warning system** alerts users before crashes
- ✅ **Backward compatible** - existing projects still work
- ✅ **Cross-platform** - works on macOS, Windows, Linux

---

## Questions & Answers

### Q: Will streaming work offline?
**A**: Yes - streams from local file system, no internet required

### Q: What about cloud-stored videos?
**A**: Would need separate implementation for remote URLs

### Q: Does this affect export quality?
**A**: No - export uses original files regardless of preview method

### Q: Can we mix blob and streaming?
**A**: Yes - fallback logic supports both simultaneously

### Q: What about audio-only tracks?
**A**: Same optimization applies - streaming works for audio too

---

## References

- [HTML5 Video Streaming](https://developer.mozilla.org/en-US/docs/Web/Guide/Audio_and_video_delivery/Live_streaming_web_audio_and_video)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Tauri Custom Protocols](https://tauri.app/v1/guides/features/custom-protocols/)
- [Performance Memory API](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)

---

## Related PRs

- PR-08: Multi-Track Compositing (foundation for this work)
- PR-10: Canvas Rendering (future optimization)

