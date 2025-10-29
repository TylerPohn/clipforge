import { create } from 'zustand';
import { VideoResolution } from '../types/recording';
import { Track, ClipData, CompositeState } from '../types/clip';
import {
  createTrack,
  findTrackById,
  reorderTrack as reorderTrackUtil,
  updateTrackProperty as updateTrackPropertyUtil,
  removeTrack as removeTrackUtil
} from '../utils/trackUtils';

export interface Clip {
  id: string;
  path: string;
  name: string;
  duration: number | null;
  resolution: { width: number; height: number } | null;
  trimStart: number;
  trimEnd: number;
  startTimeInSequence: number; // Where this clip starts in the overall timeline
  blobUrl: string | null; // Pre-loaded blob URL for the video file
}

interface VideoState {
  // Multi-clip support (sequential playback)
  clips: Clip[];

  // Multi-track compositing (layered/simultaneous playback)
  composite: CompositeState;

  // Legacy single-clip properties (computed from clips array)
  videoPath: string | null;
  videoName: string | null;
  videoDuration: number | null;  // Total duration of all clips combined
  videoResolution: { width: number; height: number } | null;

  // Playback state
  isPlaying: boolean;
  currentTime: number; // Current time in the overall sequence
  volume: number;

  // Loading state
  isSplitting: boolean;

  // Recording resolution state
  selectedResolution: VideoResolution;
  screenSourceResolution?: { width: number; height: number };
  cameraSourceResolution?: { width: number; height: number };

  // Multi-clip methods (sequential)
  addClip: (path: string, name: string) => string; // Returns clip ID
  updateClipMetadata: (clipId: string, duration: number, resolution: { width: number; height: number }) => void;
  updateClipBlobUrl: (clipId: string, blobUrl: string) => void;
  updateClipTrim: (clipId: string, trimStart: number, trimEnd: number) => void;
  resetClipTrim: (clipId: string) => void;
  removeClip: (clipId: string) => void;
  reorderClip: (clipId: string, newIndex: number) => void;
  splitClipAtTime: (clipId: string, splitTime: number) => void;
  clearAllClips: () => void;
  getCurrentClip: () => Clip | null;

  // Track Management Actions (compositing)
  addTrack: (clipData: ClipData) => void;
  removeTrack: (trackId: string) => void;
  selectTrack: (trackId: string) => void;
  reorderTrack: (trackId: string, newIndex: number) => void;

  // Track Property Updates
  updateTrackProperty: <K extends keyof Track>(trackId: string, property: K, value: Track[K]) => void;
  updateTrackPosition: (trackId: string, x: number, y: number) => void;
  updateTrackVolume: (trackId: string, volume: number) => void;
  updateTrackOpacity: (trackId: string, opacity: number) => void;
  updateTrackOffset: (trackId: string, offset: number) => void;
  toggleTrackVisibility: (trackId: string) => void;

  // Composite Playback
  setCompositePlaybackState: (isPlaying: boolean) => void;
  setCompositeCurrentTime: (time: number) => void;
  toggleSoloTrack: (trackId: string) => void;

  // Legacy methods (kept for backward compatibility, now internally use clips)
  setVideo: (path: string, name: string) => void;
  setMetadata: (duration: number, resolution: { width: number; height: number }) => void;
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

// Helper function to calculate total duration (using trimmed durations)
const calculateTotalDuration = (clips: Clip[]): number => {
  if (clips.length === 0) return 0;
  const lastClip = clips[clips.length - 1];
  const trimmedDuration = lastClip.duration !== null ? (lastClip.trimEnd - lastClip.trimStart) : 0;
  return lastClip.startTimeInSequence + trimmedDuration;
};

// Helper function to recalculate start times in sequence (using trimmed durations)
const recalculateStartTimes = (clips: Clip[]): Clip[] => {
  let currentTime = 0;
  return clips.map(clip => {
    const updatedClip = { ...clip, startTimeInSequence: currentTime };
    // Use trimmed duration instead of full duration
    const trimmedDuration = clip.duration !== null ? (clip.trimEnd - clip.trimStart) : 0;
    currentTime += trimmedDuration;
    return updatedClip;
  });
};

export const useVideoStore = create<VideoState>((set, get) => ({
  // Initial state
  clips: [],
  composite: {
    tracks: [],
    selectedTrackId: undefined,
    soloTrackId: undefined,
    isPlayingComposite: false,
    currentTime: 0
  },
  videoPath: null,
  videoName: null,
  videoDuration: null,
  videoResolution: null,
  isPlaying: false,
  currentTime: 0,
  volume: 1.0,
  isSplitting: false,
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
      startTimeInSequence: calculateTotalDuration(state.clips),
      blobUrl: null
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
      videoResolution: resolution // Use latest clip's resolution
    });
  },

  updateClipBlobUrl: (clipId, blobUrl) => {
    const state = get();
    const clipIndex = state.clips.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    const updatedClips = [...state.clips];
    updatedClips[clipIndex] = {
      ...updatedClips[clipIndex],
      blobUrl
    };

    console.log('[VideoStore] Updating clip blob URL:', { clipId, blobUrl });

    set({ clips: updatedClips });
  },

  updateClipTrim: (clipId, trimStart, trimEnd) => {
    const state = get();
    const clipIndex = state.clips.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    const clip = state.clips[clipIndex];

    // Validate trim values
    const duration = clip.duration || 0;
    const validTrimStart = Math.max(0, Math.min(trimStart, duration));
    const validTrimEnd = Math.max(validTrimStart, Math.min(trimEnd, duration));

    // Ensure minimum trim duration (0.1 seconds)
    const minDuration = 0.1;
    if (validTrimEnd - validTrimStart < minDuration) {
      console.warn('[VideoStore] Trim duration too short, minimum is 0.1s');
      return;
    }

    const updatedClips = [...state.clips];
    updatedClips[clipIndex] = {
      ...updatedClips[clipIndex],
      trimStart: validTrimStart,
      trimEnd: validTrimEnd
    };

    // Recalculate timeline positions since clip durations changed
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Updating clip trim:', { clipId, trimStart: validTrimStart, trimEnd: validTrimEnd, totalDuration });

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration
    });
  },

  resetClipTrim: (clipId) => {
    const state = get();
    const clipIndex = state.clips.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    const clip = state.clips[clipIndex];
    const duration = clip.duration || 0;

    const updatedClips = [...state.clips];
    updatedClips[clipIndex] = {
      ...updatedClips[clipIndex],
      trimStart: 0,
      trimEnd: duration
    };

    // Recalculate timeline positions
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Resetting clip trim:', { clipId, duration, totalDuration });

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration
    });
  },

  removeClip: (clipId) => {
    const state = get();

    // Clean up blob URL before removing clip
    const clipToRemove = state.clips.find(c => c.id === clipId);
    if (clipToRemove?.blobUrl) {
      URL.revokeObjectURL(clipToRemove.blobUrl);
      console.log('[VideoStore] Revoked blob URL for clip:', clipId);
    }

    const updatedClips = state.clips.filter(c => c.id !== clipId);
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Removing clip:', clipId);

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      videoPath: recalculatedClips.length > 0 ? recalculatedClips[recalculatedClips.length - 1].path : null,
      videoName: recalculatedClips.length > 0 ? recalculatedClips[recalculatedClips.length - 1].name : null
    });
  },

  reorderClip: (clipId, newIndex) => {
    const state = get();
    const oldIndex = state.clips.findIndex(c => c.id === clipId);

    if (oldIndex === -1) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    if (oldIndex === newIndex) {
      return; // No change needed
    }

    // Create a new array with the clip moved to the new position
    const updatedClips = [...state.clips];
    const [movedClip] = updatedClips.splice(oldIndex, 1);
    updatedClips.splice(newIndex, 0, movedClip);

    // Recalculate start times since clip order changed
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Reordering clip:', { clipId, oldIndex, newIndex });
    console.log('[VideoStore] New clip order:', recalculatedClips.map(c => ({
      id: c.id,
      name: c.name,
      startTime: c.startTimeInSequence,
      duration: c.duration ? (c.trimEnd - c.trimStart) : 0
    })));

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration
    });
  },

  splitClipAtTime: (clipId, splitTime) => {
    const state = get();

    // Set loading state
    set({ isSplitting: true });

    // Use setTimeout to allow UI to update with spinner
    setTimeout(() => {
      const clipIndex = state.clips.findIndex(c => c.id === clipId);

      if (clipIndex === -1) {
        console.error('[VideoStore] Clip not found:', clipId);
        set({ isSplitting: false });
        return;
      }

      const clip = state.clips[clipIndex];

      // Ensure clip has metadata loaded
      if (!clip.duration) {
        console.warn('[VideoStore] Cannot split clip without metadata:', clipId);
        set({ isSplitting: false });
        return;
      }

      // Convert split time from sequence coordinates to clip-internal time
      const timeInClip = splitTime - clip.startTimeInSequence;
      const splitPointInOriginal = clip.trimStart + timeInClip;

      // Validate split point is within trimmed range and not too close to edges
      const minDuration = 0.1;
      if (splitPointInOriginal <= clip.trimStart + minDuration ||
          splitPointInOriginal >= clip.trimEnd - minDuration) {
        console.warn('[VideoStore] Split point too close to clip boundaries');
        set({ isSplitting: false });
        return;
      }

      // Generate unique IDs for the two new clips
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const clipId1 = `clip-${timestamp}-${randomSuffix}-1`;
      const clipId2 = `clip-${timestamp}-${randomSuffix}-2`;

      // Create first clip (from start to split point)
      const clip1: Clip = {
        ...clip,
        id: clipId1,
        name: `${clip.name}-1`,
        trimEnd: splitPointInOriginal,
        startTimeInSequence: clip.startTimeInSequence
      };

      // Create second clip (from split point to end)
      const clip2: Clip = {
        ...clip,
        id: clipId2,
        name: `${clip.name}-2`,
        trimStart: splitPointInOriginal,
        startTimeInSequence: 0 // Will be recalculated
      };

      console.log('[VideoStore] Splitting clip:', {
        clipId,
        splitTime,
        splitPointInOriginal,
        clip1Duration: clip1.trimEnd - clip1.trimStart,
        clip2Duration: clip2.trimEnd - clip2.trimStart
      });

      // Replace the original clip with two new clips
      const updatedClips = [...state.clips];
      updatedClips.splice(clipIndex, 1, clip1, clip2);

      // Recalculate timeline positions
      const recalculatedClips = recalculateStartTimes(updatedClips);
      const totalDuration = calculateTotalDuration(recalculatedClips);

      set({
        clips: recalculatedClips,
        videoDuration: totalDuration,
        currentTime: splitTime, // Keep playhead at split point
        isSplitting: false
      });
    }, 50);
  },

  clearAllClips: () => {
    const state = get();

    // Clean up all blob URLs
    state.clips.forEach(clip => {
      if (clip.blobUrl) {
        URL.revokeObjectURL(clip.blobUrl);
      }
    });

    console.log('[VideoStore] Clearing all clips');
    set({
      clips: [],
      videoPath: null,
      videoName: null,
      videoDuration: null,
      videoResolution: null,
      isPlaying: false,
      currentTime: 0
    });
  },

  getCurrentClip: () => {
    const state = get();
    const currentTime = state.currentTime;

    // Find which clip the playhead is currently in (using trimmed durations)
    for (const clip of state.clips) {
      const trimmedDuration = clip.duration !== null ? (clip.trimEnd - clip.trimStart) : 0;
      const clipEndTime = clip.startTimeInSequence + trimmedDuration;
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
      startTimeInSequence: 0,
      blobUrl: null
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
      videoResolution: resolution
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

  // Track Management Actions
  addTrack: (clipData: ClipData) => {
    const state = get();
    const newTrack = createTrack(clipData, state.composite.tracks.length);

    console.log('[VideoStore] Adding track:', newTrack.name, newTrack.id);

    set({
      composite: {
        ...state.composite,
        tracks: [...state.composite.tracks, newTrack],
        selectedTrackId: newTrack.id
      }
    });
  },

  removeTrack: (trackId: string) => {
    const state = get();
    const updatedTracks = removeTrackUtil(state.composite.tracks, trackId);

    console.log('[VideoStore] Removing track:', trackId);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks,
        selectedTrackId: state.composite.selectedTrackId === trackId
          ? (updatedTracks.length > 0 ? updatedTracks[0].id : undefined)
          : state.composite.selectedTrackId
      }
    });
  },

  selectTrack: (trackId: string) => {
    const state = get();
    const track = findTrackById(state.composite.tracks, trackId);

    if (!track) {
      console.error('[VideoStore] Track not found:', trackId);
      return;
    }

    console.log('[VideoStore] Selecting track:', track.name, trackId);

    set({
      composite: {
        ...state.composite,
        selectedTrackId: trackId
      }
    });
  },

  reorderTrack: (trackId: string, newIndex: number) => {
    const state = get();
    const reorderedTracks = reorderTrackUtil(state.composite.tracks, trackId, newIndex);

    console.log('[VideoStore] Reordering track:', trackId, 'to index', newIndex);

    set({
      composite: {
        ...state.composite,
        tracks: reorderedTracks
      }
    });
  },

  updateTrackProperty: <K extends keyof Track>(trackId: string, property: K, value: Track[K]) => {
    const state = get();
    const updatedTracks = updateTrackPropertyUtil(state.composite.tracks, trackId, property, value);

    console.log('[VideoStore] Updating track property:', trackId, property, value);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  updateTrackPosition: (trackId: string, x: number, y: number) => {
    const state = get();
    const updatedTracks = updateTrackPropertyUtil(
      state.composite.tracks,
      trackId,
      'position',
      { x, y }
    );

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  updateTrackVolume: (trackId: string, volume: number) => {
    const state = get();
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const updatedTracks = updateTrackPropertyUtil(
      state.composite.tracks,
      trackId,
      'volume',
      clampedVolume
    );

    console.log('[VideoStore] Updating track volume:', trackId, clampedVolume);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  updateTrackOpacity: (trackId: string, opacity: number) => {
    const state = get();
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    const updatedTracks = updateTrackPropertyUtil(
      state.composite.tracks,
      trackId,
      'opacity',
      clampedOpacity
    );

    console.log('[VideoStore] Updating track opacity:', trackId, clampedOpacity);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  updateTrackOffset: (trackId: string, offset: number) => {
    const state = get();
    const clampedOffset = Math.max(0, offset);
    const updatedTracks = updateTrackPropertyUtil(
      state.composite.tracks,
      trackId,
      'offset',
      clampedOffset
    );

    console.log('[VideoStore] Updating track offset:', trackId, clampedOffset);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  toggleTrackVisibility: (trackId: string) => {
    const state = get();
    const track = findTrackById(state.composite.tracks, trackId);

    if (!track) {
      console.error('[VideoStore] Track not found:', trackId);
      return;
    }

    const updatedTracks = updateTrackPropertyUtil(
      state.composite.tracks,
      trackId,
      'isVisible',
      !track.isVisible
    );

    console.log('[VideoStore] Toggling track visibility:', trackId, !track.isVisible);

    set({
      composite: {
        ...state.composite,
        tracks: updatedTracks
      }
    });
  },

  // Composite Playback
  setCompositePlaybackState: (isPlaying: boolean) => {
    const state = get();

    console.log('[VideoStore] Setting composite playback state:', isPlaying);

    set({
      composite: {
        ...state.composite,
        isPlayingComposite: isPlaying
      }
    });
  },

  setCompositeCurrentTime: (time: number) => {
    const state = get();

    set({
      composite: {
        ...state.composite,
        currentTime: time
      }
    });
  },

  toggleSoloTrack: (trackId: string) => {
    const state = get();
    const track = findTrackById(state.composite.tracks, trackId);

    if (!track) {
      console.error('[VideoStore] Track not found:', trackId);
      return;
    }

    // If the same track is clicked, toggle solo off
    const newSoloTrackId = state.composite.soloTrackId === trackId ? undefined : trackId;

    console.log('[VideoStore] Toggling solo for track:', trackId, 'New solo state:', newSoloTrackId);

    set({
      composite: {
        ...state.composite,
        soloTrackId: newSoloTrackId
      }
    });
  },
}));
