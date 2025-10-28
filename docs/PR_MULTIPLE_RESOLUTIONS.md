# Multiple Resolutions Support - PR Documentation

## Overview

ClipForge currently captures video at a fixed resolution (720p for camera, system resolution for screen recording). This PR extends both camera and screen recording to support **user-selectable output resolutions**: 720p, 1080p, or source resolution. This gives users control over file size, quality, and performance trade-offs.

## Current State

### What Works Today
- ✅ Screen recording at system resolution
- ✅ Camera recording at fixed 720p
- ✅ FFmpeg-based recording and export
- ✅ Basic recording controls (start, stop, preview)

### What's Missing
- ❌ Resolution selection UI in recording dialog
- ❌ Resolution-aware FFmpeg configuration
- ❌ Source resolution detection for scaling
- ❌ Resolution preference persistence
- ❌ Quality/filesize tradeoff information
- ❌ Dynamic bitrate adjustment based on resolution

## Proposed Architecture

### 1. Data Structures

#### Resolution Enum
```typescript
// src/types/recording.ts (NEW/UPDATED)
export enum VideoResolution {
  '720P' = '720p',
  '1080P' = '1080p',
  'SOURCE' = 'source'
}

export interface ResolutionOption {
  id: VideoResolution;
  label: string;
  description: string;
  maxBitrate: number;           // For quality indication
  estimatedFileSize?: string;   // Per minute of recording
  recommendedUses: string[];    // E.g., "Webcam", "Screen sharing", etc.
}

export const RESOLUTION_OPTIONS: Record<VideoResolution, ResolutionOption> = {
  [VideoResolution['720P']]: {
    id: '720p',
    label: '720p',
    description: 'Balanced quality and file size',
    maxBitrate: 2500,
    estimatedFileSize: '180-220 MB/min',
    recommendedUses: ['Quick clips', 'Social media', 'Webcam recording']
  },
  [VideoResolution['1080P']]: {
    id: '1080p',
    label: '1080p',
    description: 'High quality, larger files',
    maxBitrate: 5000,
    estimatedFileSize: '350-450 MB/min',
    recommendedUses: ['Professional use', 'Tutorials', 'Screen recording']
  },
  [VideoResolution['SOURCE']]: {
    id: 'source',
    label: 'Source Resolution',
    description: 'Original resolution (camera native, screen native)',
    maxBitrate: 8000,
    estimatedFileSize: 'Varies (typically 400-800 MB/min)',
    recommendedUses: ['Maximum quality', 'Professional archival']
  }
};
```

#### Store Updates
```typescript
// src/store/videoStore.ts (UPDATED)
interface RecordingState {
  // Existing
  isRecording: boolean;
  recordingSource: 'screen' | 'camera';

  // NEW
  selectedResolution: VideoResolution;
  cameraSourceResolution?: { width: number; height: number };
  screenSourceResolution?: { width: number; height: number };

  // Actions
  setSelectedResolution(resolution: VideoResolution): void;
  setCameraSourceResolution(resolution: { width: number; height: number }): void;
  setScreenSourceResolution(resolution: { width: number; height: number }): void;
}
```

### 2. Component Changes

#### RecordingDialog.tsx (Updated)
```typescript
// Add resolution selection UI after source selection

<Box sx={{ mt: 2, mb: 2 }}>
  <Typography variant="subtitle2" gutterBottom>
    Output Resolution:
  </Typography>
  <ToggleButtonGroup
    value={selectedResolution}
    exclusive
    onChange={(_, newResolution) => {
      if (newResolution) setSelectedResolution(newResolution);
    }}
    fullWidth
  >
    {Object.values(RESOLUTION_OPTIONS).map(option => (
      <ToggleButton key={option.id} value={option.id}>
        <Stack alignItems="center" spacing={0.5} sx={{ py: 1 }}>
          <Typography variant="body2" fontWeight="bold">
            {option.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {option.estimatedFileSize}
          </Typography>
        </Stack>
      </ToggleButton>
    ))}
  </ToggleButtonGroup>

  {/* Resolution Info */}
  <Alert severity="info" sx={{ mt: 2 }}>
    <Typography variant="body2">
      {RESOLUTION_OPTIONS[selectedResolution].description}
    </Typography>
  </Alert>
</Box>
```

#### ResolutionSelector.tsx (New Component)
```typescript
// src/components/ResolutionSelector.tsx (NEW)
import { Box, ToggleButtonGroup, ToggleButton, Typography, Stack, Alert } from '@mui/material';
import { VideoResolution, RESOLUTION_OPTIONS } from '../types/recording';

interface ResolutionSelectorProps {
  value: VideoResolution;
  onChange: (resolution: VideoResolution) => void;
  source: 'screen' | 'camera';
  sourceResolution?: { width: number; height: number };
}

export function ResolutionSelector({
  value,
  onChange,
  source,
  sourceResolution
}: ResolutionSelectorProps) {
  const getDisplayResolution = (resolution: VideoResolution): string => {
    if (resolution === VideoResolution.SOURCE && sourceResolution) {
      return `${sourceResolution.width}x${sourceResolution.height}`;
    }
    return resolution;
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Output Resolution:
      </Typography>

      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, newResolution) => {
          if (newResolution) onChange(newResolution);
        }}
        fullWidth
      >
        {Object.values(RESOLUTION_OPTIONS).map(option => (
          <ToggleButton key={option.id} value={option.id}>
            <Stack alignItems="center" spacing={0.5} sx={{ py: 1 }}>
              <Typography variant="body2" fontWeight="bold">
                {getDisplayResolution(option.id as VideoResolution)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.estimatedFileSize}
              </Typography>
            </Stack>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Description */}
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>{RESOLUTION_OPTIONS[value].label}:</strong>{' '}
          {RESOLUTION_OPTIONS[value].description}
        </Typography>
        {sourceResolution && value === VideoResolution.SOURCE && (
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Source: {sourceResolution.width}x{sourceResolution.height}
          </Typography>
        )}
      </Alert>
    </Box>
  );
}
```

### 3. Backend Changes

#### FFmpeg Configuration Updates
```rust
// src-tauri/src/main.rs (UPDATED)

#[derive(serde::Deserialize)]
struct RecordingOptions {
    resolution: String,  // "720p", "1080p", or "source"
    source_width: Option<i32>,  // Source resolution if needed
    source_height: Option<i32>,
}

#[tauri::command]
fn start_camera_recording(
    output_path: String,
    options: RecordingOptions,
    window: tauri::Window
) -> Result<String, String> {
    let (width, height, bitrate) = match options.resolution.as_str() {
        "720p" => (1280, 720, "2500k"),
        "1080p" => (1920, 1080, "5000k"),
        "source" => {
            if let (Some(w), Some(h)) = (options.source_width, options.source_height) {
                (w as i32, h as i32, "8000k")
            } else {
                return Err("Source resolution not available".to_string());
            }
        },
        _ => return Err("Invalid resolution".to_string()),
    };

    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-video_size", &format!("{}x{}", width, height),
            "-i", "0",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "dshow",
            "-framerate", "30",
            "-video_size", &format!("{}x{}", width, height),
            "-i", "video=Integrated Camera",
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    let child = std::process::Command::new("ffmpeg")
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    let mut process = CAMERA_RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    Ok("Recording started".to_string())
}

#[tauri::command]
fn start_screen_recording(
    output_path: String,
    options: RecordingOptions,
    window: tauri::Window
) -> Result<String, String> {
    let (width, height, bitrate) = match options.resolution.as_str() {
        "720p" => (1280, 720, "2500k"),
        "1080p" => (1920, 1080, "5000k"),
        "source" => {
            if let (Some(w), Some(h)) = (options.source_width, options.source_height) {
                (w as i32, h as i32, "8000k")
            } else {
                return Err("Source resolution not available".to_string());
            }
        },
        _ => return Err("Invalid resolution".to_string()),
    };

    // Platform-specific screen capture with resolution scaling
    let args = if cfg!(target_os = "macos") {
        vec![
            "-f", "avfoundation",
            "-framerate", "30",
            "-i", "1",  // macOS screen index
            "-vf", &format!("scale={}:{}", width, height),
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "-f", "gdigrab",
            "-framerate", "30",
            "-i", "desktop",
            "-vf", &format!("scale={}:{}", width, height),
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", bitrate,
            &output_path
        ]
    } else {
        return Err("Unsupported platform".to_string());
    };

    let child = std::process::Command::new("ffmpeg")
        .args(&args)
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    let mut process = RECORDING_PROCESS.lock().unwrap();
    *process = Some(child);

    Ok("Recording started".to_string())
}

// New command to get screen resolution
#[tauri::command]
fn get_screen_resolution() -> Result<ScreenResolution, String> {
    #[derive(serde::Serialize)]
    struct ScreenResolution {
        width: i32,
        height: i32,
    }

    if cfg!(target_os = "macos") {
        // Use NSScreen API or ffmpeg to detect
        // Simplified: return common resolution
        Ok(ScreenResolution {
            width: 1920,
            height: 1080,
        })
    } else if cfg!(target_os = "windows") {
        // Use Windows API or ffmpeg to detect
        Ok(ScreenResolution {
            width: 1920,
            height: 1080,
        })
    } else {
        Err("Unsupported platform".to_string())
    }
}

// New command to get camera capabilities
#[tauri::command]
fn get_camera_capabilities() -> Result<CameraCapabilities, String> {
    #[derive(serde::Serialize)]
    struct CameraCapabilities {
        native_width: i32,
        native_height: i32,
        supported_resolutions: Vec<String>,
    }

    // Query FFmpeg for camera capabilities
    // Simplified: return common resolutions
    Ok(CameraCapabilities {
        native_width: 1920,
        native_height: 1080,
        supported_resolutions: vec!["720p".to_string(), "1080p".to_string(), "source".to_string()],
    })
}
```

### 4. Hook Updates

#### useRecordingResolution.ts (New)
```typescript
// src/hooks/useRecordingResolution.ts (NEW)
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { VideoResolution } from '../types/recording';

export function useRecordingResolution(source: 'screen' | 'camera') {
  const [sourceResolution, setSourceResolution] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadResolution = async () => {
      try {
        setLoading(true);
        if (source === 'screen') {
          const resolution = await invoke('get_screen_resolution');
          setSourceResolution(resolution as any);
        } else {
          const caps = await invoke('get_camera_capabilities');
          const { native_width, native_height } = caps as any;
          setSourceResolution({ width: native_width, height: native_height });
        }
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to get resolution');
      } finally {
        setLoading(false);
      }
    };

    loadResolution();
  }, [source]);

  return { sourceResolution, loading, error };
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (4-5 hours)
**Goal:** Add resolution selection and backend support

#### Tasks:
1. **Create types and constants** (30 min)
   - Add `src/types/recording.ts` with VideoResolution enum and options
   - Define bitrate and file size estimates

2. **Update Rust backend** (90 min)
   - Modify `start_camera_recording` to accept resolution parameter
   - Modify `start_screen_recording` to accept resolution parameter
   - Add `get_screen_resolution()` command
   - Add `get_camera_capabilities()` command
   - Test FFmpeg arguments for each resolution

3. **Create ResolutionSelector component** (60 min)
   - Build UI with toggle buttons for 720p, 1080p, source
   - Add resolution info/description display
   - Style and integrate with Material-UI

4. **Update RecordingDialog** (45 min)
   - Import and integrate ResolutionSelector
   - Hook up state management
   - Pass resolution to backend commands

5. **Create useRecordingResolution hook** (45 min)
   - Implement source resolution detection
   - Handle loading/error states
   - Cache results

6. **Store integration** (30 min)
   - Add resolution state to videoStore
   - Add setSelectedResolution action
   - Default to 720p

### Phase 2: Testing & Polish (2-3 hours)
**Goal:** Ensure quality and reliability

#### Tasks:
1. **Unit tests** (30 min)
   - Test resolution enum values
   - Test bitrate/filesize calculations
   - Test hook logic

2. **Integration tests** (60 min)
   - Test camera recording at each resolution
   - Test screen recording at each resolution
   - Verify file sizes match estimates
   - Test resolution with different screen sizes

3. **E2E testing** (30 min)
   - Full recording workflow at each resolution
   - Verify output video dimensions
   - Test on both macOS and Windows

4. **UI/UX polish** (30 min)
   - Responsive resolution selector
   - Clear visual feedback
   - Helpful error messages
   - Tooltips explaining trade-offs

## File Structure Changes

```
src/
├── types/
│   ├── recording.ts (NEW/UPDATED)  // Resolution types
│
├── components/
│   ├── ResolutionSelector.tsx (NEW)   // Resolution selector UI
│   ├── RecordingDialog.tsx (UPDATED)  // Integrate selector
│
├── hooks/
│   ├── useRecordingResolution.ts (NEW) // Resolution detection
│   └── useRecording.ts (UPDATED)       // Pass resolution to commands
│
└── store/
    └── videoStore.ts (UPDATED)        // Add resolution state

src-tauri/
└── src/
    └── main.rs (UPDATED)              // Update recording commands
```

## User Experience Flow

### Scenario 1: Basic Camera Recording with Resolution Selection
```
1. User clicks "Record" button
2. Recording dialog opens with source selection (Screen/Camera)
3. User selects "Camera" source
4. Camera preview loads
5. Resolution selector appears below preview
6. Default selection: 720p (with "180-220 MB/min" estimate)
7. User can toggle to 1080p or Source resolution
8. Info box shows: "1080p: High quality, larger files"
9. User clicks "Start Recording"
10. FFmpeg starts with appropriate resolution settings
11. Recording proceeds at selected resolution
12. User stops recording
13. File is created at selected resolution
```

### Scenario 2: Screen Recording with Source Resolution
```
1. User opens Recording dialog
2. Selects "Screen" source
3. Resolution selector shows available options
4. "Source Resolution" displays actual screen dimensions (e.g., "2560x1600")
5. User selects "Source Resolution"
6. Info box warns: "Larger files expected - 400-800 MB/min"
7. User proceeds with recording
8. Screen captured at native resolution
```

### Scenario 3: Multiple Recordings at Different Resolutions
```
1. User records first clip at 720p (quick turnaround)
2. Records second clip at 1080p (better quality)
3. Can trim and export both at their respective qualities
4. No re-encoding needed, native resolution preserved
```

## Success Criteria

- ✅ User can select 720p, 1080p, or source resolution
- ✅ Camera recording works at all resolutions
- ✅ Screen recording works at all resolutions
- ✅ Output video dimensions match selected resolution
- ✅ Bitrates appropriate for each resolution
- ✅ File sizes match estimates (±10%)
- ✅ Source resolution detection works on macOS and Windows
- ✅ Graceful fallback when source resolution unavailable
- ✅ Clear UI explaining trade-offs
- ✅ No performance degradation

## Performance Considerations

### Encoding Performance
- **720p**: ~30 fps with ultrafast preset, minimal CPU impact
- **1080p**: ~20-25 fps with ultrafast preset, moderate CPU usage
- **Source (4K+)**: May drop frames, consider medium preset if needed

### Storage Impact
- **720p**: ~200 MB/minute (typical)
- **1080p**: ~400 MB/minute (typical)
- **Source**: Varies widely, can exceed 1 GB/minute

### User Guidance
- Default to 720p for most use cases
- Recommend 1080p for professional/archival
- Warn about high storage for source resolution

## References & Related PRDs

- Camera Recording: `docs/PRD-07-Camera-Recording.md`
- Screen Recording: `docs/PRD-06-Screen-Recording.md`
- Video Export: `docs/PRD-04-Video-Export.md`
- Multi-Clip Support: `docs/PR_MULTI_CLIP_SUPPORT.md`

## Open Questions

1. **Should resolution persist between sessions?** (Proposed: Yes, store in preferences)
2. **What about audio quality scaling?** (Proposed: Keep audio at source, only scale video)
3. **Should we auto-detect optimal resolution?** (Proposed: Post-MVP enhancement)
4. **Support for custom resolutions?** (Proposed: Future feature, MVP uses presets only)

## Notes

This feature significantly improves user control over recording quality and file size. The implementation is backward-compatible with existing recording functionality, simply adding an optional resolution parameter to the backend commands (defaults to 720p if not specified).

The estimated bitrates and file sizes are guidelines - actual values depend on video content, compression, and system performance. Consider them within ±20% accuracy for user guidance purposes.
