import { create } from 'zustand';
import { VideoResolution } from '../types/recording';

export interface Clip {
  id: string;
  path: string;
  name: string;
  duration: number | null;
  resolution: { width: number; height: number } | null;
  trimStart: number;
  trimEnd: number;
  startTimeInSequence: number; // Where this clip starts in the overall timeline
}

interface VideoState {
  // Multi-clip support
  clips: Clip[];

  // Legacy single-clip properties (computed from clips array)
  videoPath: string | null;
  videoName: string | null;
  videoDuration: number | null;  // Total duration of all clips combined
  videoResolution: { width: number; height: number } | null;
  trimStart: number;
  trimEnd: number;

  // Playback state
  isPlaying: boolean;
  currentTime: number; // Current time in the overall sequence
  volume: number;

  // Recording resolution state
  selectedResolution: VideoResolution;
  screenSourceResolution?: { width: number; height: number };
  cameraSourceResolution?: { width: number; height: number };

  // Multi-clip methods
  addClip: (path: string, name: string) => string; // Returns clip ID
  updateClipMetadata: (clipId: string, duration: number, resolution: { width: number; height: number }) => void;
  removeClip: (clipId: string) => void;
  clearAllClips: () => void;
  getCurrentClip: () => Clip | null;

  // Legacy methods (kept for backward compatibility, now internally use clips)
  setVideo: (path: string, name: string) => void;
  setMetadata: (duration: number, resolution: { width: number; height: number }) => void;
  setTrimPoints: (start: number, end: number) => void;
  clearVideo: () => void;

  // Playback methods
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setVolume: (volume: number) => void;

  // Recording resolution methods
  setSelectedResolution: (resolution: VideoResolution) => void;
  setScreenSourceResolution: (resolution: { width: number; height: number } | undefined) => void;
  setCameraSourceResolution: (resolution: { width: number; height: number } | undefined) => void;
}

// Helper function to calculate total duration
const calculateTotalDuration = (clips: Clip[]): number => {
  if (clips.length === 0) return 0;
  const lastClip = clips[clips.length - 1];
  return lastClip.startTimeInSequence + (lastClip.duration || 0);
};

// Helper function to recalculate start times in sequence
const recalculateStartTimes = (clips: Clip[]): Clip[] => {
  let currentTime = 0;
  return clips.map(clip => {
    const updatedClip = { ...clip, startTimeInSequence: currentTime };
    currentTime += (clip.duration || 0);
    return updatedClip;
  });
};

export const useVideoStore = create<VideoState>((set, get) => ({
  // Initial state
  clips: [],
  videoPath: null,
  videoName: null,
  videoDuration: null,
  videoResolution: null,
  trimStart: 0,
  trimEnd: 0,
  isPlaying: false,
  currentTime: 0,
  volume: 1.0,
  selectedResolution: VideoResolution['720P'],
  screenSourceResolution: undefined,
  cameraSourceResolution: undefined,

  // Multi-clip methods
  addClip: (path, name) => {
    const state = get();
    const clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newClip: Clip = {
      id: clipId,
      path,
      name,
      duration: null,
      resolution: null,
      trimStart: 0,
      trimEnd: 0,
      startTimeInSequence: calculateTotalDuration(state.clips)
    };

    const updatedClips = [...state.clips, newClip];

    console.log('[VideoStore] Adding clip:', { clipId, path, name });

    set({
      clips: updatedClips,
      videoPath: path, // Set to latest clip for legacy compatibility
      videoName: name,
      isPlaying: false,
      currentTime: state.currentTime // Keep playhead where it is
    });

    return clipId;
  },

  updateClipMetadata: (clipId, duration, resolution) => {
    const state = get();
    const clipIndex = state.clips.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    const updatedClips = [...state.clips];
    updatedClips[clipIndex] = {
      ...updatedClips[clipIndex],
      duration,
      resolution,
      trimEnd: duration // Set trim end to full duration initially
    };

    // Recalculate start times for all clips after this one
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Updating clip metadata:', { clipId, duration, resolution, totalDuration });

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      videoResolution: resolution, // Use latest clip's resolution
      trimStart: 0,
      trimEnd: totalDuration
    });
  },

  removeClip: (clipId) => {
    const state = get();
    const updatedClips = state.clips.filter(c => c.id !== clipId);
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Removing clip:', clipId);

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      videoPath: recalculatedClips.length > 0 ? recalculatedClips[recalculatedClips.length - 1].path : null,
      videoName: recalculatedClips.length > 0 ? recalculatedClips[recalculatedClips.length - 1].name : null,
      trimStart: 0,
      trimEnd: totalDuration
    });
  },

  clearAllClips: () => {
    console.log('[VideoStore] Clearing all clips');
    set({
      clips: [],
      videoPath: null,
      videoName: null,
      videoDuration: null,
      videoResolution: null,
      trimStart: 0,
      trimEnd: 0,
      isPlaying: false,
      currentTime: 0
    });
  },

  getCurrentClip: () => {
    const state = get();
    const currentTime = state.currentTime;

    // Find which clip the playhead is currently in
    for (const clip of state.clips) {
      const clipEndTime = clip.startTimeInSequence + (clip.duration || 0);
      if (currentTime >= clip.startTimeInSequence && currentTime < clipEndTime) {
        return clip;
      }
    }

    // If we're past all clips, return the last clip
    if (state.clips.length > 0) {
      return state.clips[state.clips.length - 1];
    }

    return null;
  },

  // Legacy methods (now work with multi-clip system)
  setVideo: (path, name) => {
    console.log('[VideoStore] Setting video (legacy):', { path, name });
    // For backward compatibility, replace all clips with a single clip
    const clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newClip: Clip = {
      id: clipId,
      path,
      name,
      duration: null,
      resolution: null,
      trimStart: 0,
      trimEnd: 0,
      startTimeInSequence: 0
    };

    set({
      clips: [newClip],
      videoPath: path,
      videoName: name,
      isPlaying: false,
      currentTime: 0
    });
  },

  setMetadata: (duration, resolution) => {
    const state = get();
    console.log('[VideoStore] Setting metadata (legacy):', { duration, resolution });

    if (state.clips.length === 0) {
      console.warn('[VideoStore] No clips to update metadata for');
      return;
    }

    // Update the last clip's metadata (for backward compatibility)
    const lastClipIndex = state.clips.length - 1;
    const updatedClips = [...state.clips];
    updatedClips[lastClipIndex] = {
      ...updatedClips[lastClipIndex],
      duration,
      resolution,
      trimEnd: duration
    };

    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      videoResolution: resolution,
      trimStart: 0,
      trimEnd: totalDuration
    });
  },

  setTrimPoints: (start, end) => {
    // Validation
    const state = get();
    const validStart = Math.max(0, start);
    const validEnd = Math.min(state.videoDuration || Infinity, end);

    // Ensure minimum trim duration (0.5 seconds)
    const minDuration = 0.5;
    if (validEnd - validStart < minDuration) {
      console.warn('[VideoStore] Trim duration too short, minimum is 0.5s');
      return;
    }

    set({
      trimStart: validStart,
      trimEnd: validEnd
    });
  },

  clearVideo: () => {
    console.log('[VideoStore] Clearing video (legacy)');
    set({
      clips: [],
      videoPath: null,
      videoName: null,
      videoDuration: null,
      videoResolution: null,
      trimStart: 0,
      trimEnd: 0,
      isPlaying: false,
      currentTime: 0
    });
  },

  // Playback actions
  setPlaying: (playing) => {
    console.log('[VideoStore] Setting playing:', playing);
    set({ isPlaying: playing });
  },
  setCurrentTime: (time) => set({ currentTime: time }),
  setVolume: (volume) => set({ volume: volume }),

  // Recording resolution actions
  setSelectedResolution: (resolution) => {
    console.log('[VideoStore] Setting resolution:', resolution);
    set({ selectedResolution: resolution });
  },
  setScreenSourceResolution: (resolution) => {
    console.log('[VideoStore] Setting screen source resolution:', resolution);
    set({ screenSourceResolution: resolution });
  },
  setCameraSourceResolution: (resolution) => {
    console.log('[VideoStore] Setting camera source resolution:', resolution);
    set({ cameraSourceResolution: resolution });
  },
}));
