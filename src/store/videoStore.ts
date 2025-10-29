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
  // Media library (imported clips not yet in timeline)
  mediaLibrary: Clip[];

  // Multi-clip support (sequential playback)
  clips: Clip[];

  // Multi-track compositing (layered/simultaneous playback)
  composite: CompositeState;

  // PiP track for sequential view (overlay video)
  pipTrack: Track | null;

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

  // Media library methods
  addClipToLibrary: (path: string, name: string) => string; // Add imported clip to library (not timeline)
  removeClipFromLibrary: (clipId: string) => void;
  updateLibraryClipMetadata: (clipId: string, duration: number, resolution: { width: number; height: number }) => void;
  updateLibraryClipBlobUrl: (clipId: string, blobUrl: string) => void;

  // Multi-clip methods (sequential timeline)
  addClip: (path: string, name: string) => string; // Returns clip ID (legacy - kept for compatibility)
  addClipToTimeline: (clipId: string, position?: 'start' | 'end') => void; // Add clip from library to timeline
  updateClipMetadata: (clipId: string, duration: number, resolution: { width: number; height: number }) => void;
  updateClipBlobUrl: (clipId: string, blobUrl: string) => void;
  updateClipTrim: (clipId: string, trimStart: number, trimEnd: number) => void;
  resetClipTrim: (clipId: string) => void;
  removeClip: (clipId: string) => void;
  reorderClip: (clipId: string, newIndex: number) => void;
  insertClipAtTime: (clipId: string, dropTime: number) => void; // For drag-and-drop to timeline
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

  // PiP Track Management (for sequential view)
  setPipTrackFromClip: (clipId: string, offset?: number) => void;
  updatePipTrackProperty: <K extends keyof Track>(property: K, value: Track[K]) => void;
  updatePipTrackPosition: (corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => void;
  updatePipTrackSize: (sizePercent: number) => void;
  updatePipTrackVolume: (volume: number) => void;
  updatePipTrackOffset: (offset: number) => void;
  updatePipTrackDuration: (duration: number) => void;
  removePipTrack: () => void;

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
  mediaLibrary: [],
  clips: [],
  composite: {
    tracks: [],
    selectedTrackId: undefined,
    soloTrackId: undefined,
    isPlayingComposite: false,
    currentTime: 0
  },
  pipTrack: null,
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

  // Media library methods
  addClipToLibrary: (path, name) => {
    const clipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newClip: Clip = {
      id: clipId,
      path,
      name,
      duration: null,
      resolution: null,
      trimStart: 0,
      trimEnd: 0,
      startTimeInSequence: 0, // Not relevant for library clips
      blobUrl: null
    };

    console.log('[VideoStore] Adding clip to library:', { clipId, path, name });

    set((state) => ({
      mediaLibrary: [...state.mediaLibrary, newClip]
    }));

    return clipId;
  },

  removeClipFromLibrary: (clipId) => {
    const state = get();
    const libraryClip = state.mediaLibrary.find(c => c.id === clipId);

    if (!libraryClip) {
      console.error('[VideoStore] Library clip not found:', clipId);
      return;
    }

    const clipPath = libraryClip.path;
    console.log('[VideoStore] Removing clip from library and all timeline instances:', { clipId, path: clipPath });

    // Remove from library
    const updatedLibrary = state.mediaLibrary.filter(c => c.id !== clipId);

    // Remove all timeline clips with the same path
    const updatedClips = state.clips.filter(c => c.path !== clipPath);

    // Recalculate start times if timeline changed
    const recalculatedClips = updatedClips.length !== state.clips.length
      ? recalculateStartTimes(updatedClips)
      : updatedClips;

    const totalDuration = calculateTotalDuration(recalculatedClips);

    // Remove PiP track if it's using the same path
    const updatedPipTrack = state.pipTrack?.clipData.path === clipPath ? null : state.pipTrack;

    console.log('[VideoStore] Removed clip:', {
      libraryClipsRemoved: 1,
      timelineClipsRemoved: state.clips.length - updatedClips.length,
      pipTrackRemoved: updatedPipTrack !== state.pipTrack
    });

    set({
      mediaLibrary: updatedLibrary,
      clips: recalculatedClips,
      videoDuration: totalDuration,
      pipTrack: updatedPipTrack
    });
  },

  updateLibraryClipMetadata: (clipId, duration, resolution) => {
    const state = get();
    const clipIndex = state.mediaLibrary.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Library clip not found:', clipId);
      return;
    }

    const updatedLibrary = [...state.mediaLibrary];
    updatedLibrary[clipIndex] = {
      ...updatedLibrary[clipIndex],
      duration,
      resolution,
      trimEnd: duration // Set trim end to full duration initially
    };

    console.log('[VideoStore] Updating library clip metadata:', { clipId, duration, resolution });

    set({ mediaLibrary: updatedLibrary });
  },

  updateLibraryClipBlobUrl: (clipId, blobUrl) => {
    const state = get();
    const clipIndex = state.mediaLibrary.findIndex(c => c.id === clipId);

    if (clipIndex === -1) {
      console.error('[VideoStore] Library clip not found:', clipId);
      return;
    }

    const updatedLibrary = [...state.mediaLibrary];
    updatedLibrary[clipIndex] = {
      ...updatedLibrary[clipIndex],
      blobUrl
    };

    console.log('[VideoStore] Updating library clip blob URL:', { clipId, blobUrl });

    set({ mediaLibrary: updatedLibrary });
  },

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

    // Find which clip the current playhead position falls into after reordering
    let newCurrentTime = state.currentTime;
    let foundValidClip = false;

    for (const clip of recalculatedClips) {
      if (!clip.duration) continue;
      const trimmedDuration = clip.trimEnd - clip.trimStart;
      const clipEndTime = clip.startTimeInSequence + trimmedDuration;

      // Check if current time is within this clip's bounds
      if (state.currentTime >= clip.startTimeInSequence && state.currentTime < clipEndTime) {
        // Current time is still valid, keep it
        foundValidClip = true;
        break;
      }
    }

    // If current time is no longer within any clip, reset to start
    if (!foundValidClip) {
      console.log('[VideoStore] Playhead position invalid after reorder, resetting to 0');
      newCurrentTime = 0;
    }

    console.log('[VideoStore] Reordering clip:', { clipId, oldIndex, newIndex });
    console.log('[VideoStore] New clip order:', recalculatedClips.map(c => ({
      id: c.id,
      name: c.name,
      startTime: c.startTimeInSequence,
      duration: c.duration ? (c.trimEnd - c.trimStart) : 0
    })));

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      currentTime: newCurrentTime
    });
  },

  addClipToTimeline: (clipId, position = 'end') => {
    const state = get();
    // Find clip in media library
    const libraryClip = state.mediaLibrary.find(c => c.id === clipId);

    if (!libraryClip) {
      console.error('[VideoStore] Clip not found in library:', clipId);
      return;
    }

    // Create a copy with new ID for timeline
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const newClipId = `clip-${timestamp}-${randomSuffix}`;

    const newClip: Clip = {
      ...libraryClip,
      id: newClipId,
      startTimeInSequence: 0 // Will be recalculated
    };

    // Add to beginning or end of timeline
    const updatedClips = position === 'start'
      ? [newClip, ...state.clips]
      : [...state.clips, newClip];

    // Recalculate start times
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Adding clip to timeline:', {
      clipId,
      newClipId,
      position,
      totalClips: recalculatedClips.length
    });

    set({
      clips: recalculatedClips,
      videoDuration: totalDuration,
      videoPath: libraryClip.path,
      videoName: libraryClip.name,
      videoResolution: libraryClip.resolution
    });
  },

  insertClipAtTime: (clipId, dropTime) => {
    const state = get();
    // Check both timeline and library
    let clip = state.clips.find(c => c.id === clipId);
    if (!clip) {
      clip = state.mediaLibrary.find(c => c.id === clipId);
    }

    if (!clip) {
      console.error('[VideoStore] Clip not found:', clipId);
      return;
    }

    // Create a copy of the clip with a new ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const newClipId = `clip-${timestamp}-${randomSuffix}`;

    const newClip: Clip = {
      ...clip,
      id: newClipId,
      startTimeInSequence: 0 // Will be recalculated
    };

    // Find insertion index based on drop time
    let insertIndex = 0;
    for (let i = 0; i < state.clips.length; i++) {
      if (state.clips[i].startTimeInSequence > dropTime) {
        insertIndex = i;
        break;
      }
      // If drop time is after all clips, insert at end
      if (i === state.clips.length - 1) {
        insertIndex = state.clips.length;
      }
    }

    // Insert the clip at the calculated index
    const updatedClips = [...state.clips];
    updatedClips.splice(insertIndex, 0, newClip);

    // Recalculate start times since we inserted a clip
    const recalculatedClips = recalculateStartTimes(updatedClips);
    const totalDuration = calculateTotalDuration(recalculatedClips);

    console.log('[VideoStore] Inserting clip at time:', { clipId, newClipId, dropTime, insertIndex });
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

      // Replace the original clip with two new clips in timeline
      const updatedClips = [...state.clips];
      updatedClips.splice(clipIndex, 1, clip1, clip2);

      // Recalculate timeline positions
      const recalculatedClips = recalculateStartTimes(updatedClips);
      const totalDuration = calculateTotalDuration(recalculatedClips);

      // Also update media library - find the library clip by path and replace with two split clips
      const libraryClipIndex = state.mediaLibrary.findIndex(c => c.path === clip.path);
      let updatedLibrary = state.mediaLibrary;

      if (libraryClipIndex !== -1) {
        const libraryClip = state.mediaLibrary[libraryClipIndex];

        // Create library versions (same as timeline clips but with their own IDs for library)
        const timestamp2 = Date.now() + 1;
        const randomSuffix2 = Math.random().toString(36).substr(2, 9);
        const libClipId1 = `clip-${timestamp2}-${randomSuffix2}-1`;
        const libClipId2 = `clip-${timestamp2}-${randomSuffix2}-2`;

        const libClip1: Clip = {
          ...libraryClip,
          id: libClipId1,
          name: `${libraryClip.name}-1`,
          trimEnd: splitPointInOriginal,
          startTimeInSequence: 0
        };

        const libClip2: Clip = {
          ...libraryClip,
          id: libClipId2,
          name: `${libraryClip.name}-2`,
          trimStart: splitPointInOriginal,
          startTimeInSequence: 0
        };

        updatedLibrary = [...state.mediaLibrary];
        updatedLibrary.splice(libraryClipIndex, 1, libClip1, libClip2);

        console.log('[VideoStore] Also split media library clip:', {
          originalLibClipId: libraryClip.id,
          newLibClipIds: [libClipId1, libClipId2]
        });
      }

      set({
        clips: recalculatedClips,
        mediaLibrary: updatedLibrary,
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

  // PiP Track Management Methods
  setPipTrackFromClip: (clipId: string, offset?: number) => {
    const state = get();
    // Check both timeline clips and library clips
    let clip = state.clips.find(c => c.id === clipId);
    if (!clip) {
      clip = state.mediaLibrary.find(c => c.id === clipId);
    }

    if (!clip) {
      console.error('[VideoStore] Clip not found in timeline or library:', clipId);
      return;
    }

    if (!clip.duration || !clip.resolution) {
      console.error('[VideoStore] Clip metadata not loaded:', clipId);
      return;
    }

    // Get canvas/video dimensions for default position
    const canvasWidth = state.videoResolution?.width || 1920;
    const canvasHeight = state.videoResolution?.height || 1080;

    // Default to bottom-right corner with 25% size
    const pipWidth = clip.resolution.width * 0.25;
    const pipHeight = clip.resolution.height * 0.25;
    const margin = 20;
    const defaultPosition = {
      x: canvasWidth - pipWidth - margin,
      y: canvasHeight - pipHeight - margin
    };

    // Use provided offset or default to 0
    const pipOffset = offset !== undefined ? offset * 1000 : 0; // Convert seconds to milliseconds

    // Convert Clip to Track for PiP
    const pipTrack: Track = {
      id: `pip-${Date.now()}`,
      name: clip.name,
      clipData: {
        id: clip.id,
        path: clip.path,
        name: clip.name,
        duration: clip.duration * 1000, // Convert to milliseconds
        width: clip.resolution.width,
        height: clip.resolution.height,
      },
      position: defaultPosition, // Default to bottom-right
      volume: 0.5, // Default to 50% volume
      opacity: 1,
      zIndex: 999, // High z-index to ensure it's on top
      isVisible: true,
      offset: pipOffset, // Use provided offset or 0
      duration: clip.duration * 1000, // Convert to milliseconds
      createdAt: new Date(),
      sourceFile: clip.path,
    };

    console.log('[VideoStore] Setting PiP track from clip:', clipId, 'position:', defaultPosition, 'offset:', pipOffset);

    set({ pipTrack });
  },

  updatePipTrackProperty: <K extends keyof Track>(property: K, value: Track[K]) => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update');
      return;
    }

    const updatedPipTrack = {
      ...state.pipTrack,
      [property]: value
    };

    console.log('[VideoStore] Updating PiP track property:', property, value);

    set({ pipTrack: updatedPipTrack });
  },

  updatePipTrackPosition: (corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update position');
      return;
    }

    // Get canvas/video dimensions (we'll use a standard 1920x1080 reference)
    // The actual positioning will be done in VideoPlayer with CSS
    // We just store the corner preference
    const canvasWidth = state.videoResolution?.width || 1920;
    const canvasHeight = state.videoResolution?.height || 1080;

    // PiP size (will be scaled by sizePercent, default 25%)
    const pipWidth = state.pipTrack.clipData.width * 0.25;
    const pipHeight = state.pipTrack.clipData.height * 0.25;

    // Margin from edges
    const margin = 20;

    let position: { x: number; y: number };

    switch (corner) {
      case 'top-left':
        position = { x: margin, y: margin };
        break;
      case 'top-right':
        position = { x: canvasWidth - pipWidth - margin, y: margin };
        break;
      case 'bottom-left':
        position = { x: margin, y: canvasHeight - pipHeight - margin };
        break;
      case 'bottom-right':
        position = { x: canvasWidth - pipWidth - margin, y: canvasHeight - pipHeight - margin };
        break;
    }

    const updatedPipTrack = {
      ...state.pipTrack,
      position
    };

    console.log('[VideoStore] Updating PiP track position:', corner, position);

    set({ pipTrack: updatedPipTrack });
  },

  updatePipTrackSize: (sizePercent: number) => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update size');
      return;
    }

    // Size is stored as a scale factor (0.25 = 25%, 0.33 = 33%, 0.5 = 50%)
    const scale = sizePercent / 100;

    // Update the clip data width/height to reflect the new size
    const updatedPipTrack = {
      ...state.pipTrack,
      clipData: {
        ...state.pipTrack.clipData,
        // Store the scale factor - actual rendering will use this
        width: state.pipTrack.clipData.width * scale,
        height: state.pipTrack.clipData.height * scale,
      }
    };

    console.log('[VideoStore] Updating PiP track size:', sizePercent, '%');

    set({ pipTrack: updatedPipTrack });
  },

  updatePipTrackVolume: (volume: number) => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update volume');
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, volume));

    const updatedPipTrack = {
      ...state.pipTrack,
      volume: clampedVolume
    };

    console.log('[VideoStore] Updating PiP track volume:', clampedVolume);

    set({ pipTrack: updatedPipTrack });
  },

  updatePipTrackOffset: (offset: number) => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update offset');
      return;
    }

    const clampedOffset = Math.max(0, offset);

    const updatedPipTrack = {
      ...state.pipTrack,
      offset: clampedOffset
    };

    console.log('[VideoStore] Updating PiP track offset:', clampedOffset);

    set({ pipTrack: updatedPipTrack });
  },

  updatePipTrackDuration: (duration: number) => {
    const state = get();

    if (!state.pipTrack) {
      console.error('[VideoStore] No PiP track to update duration');
      return;
    }

    const clampedDuration = Math.max(100, duration); // Minimum 100ms

    const updatedPipTrack = {
      ...state.pipTrack,
      duration: clampedDuration
    };

    console.log('[VideoStore] Updating PiP track duration:', clampedDuration);

    set({ pipTrack: updatedPipTrack });
  },

  removePipTrack: () => {
    const state = get();

    if (!state.pipTrack) {
      console.warn('[VideoStore] No PiP track to remove');
      return;
    }

    console.log('[VideoStore] Removing PiP track');

    set({ pipTrack: null });
  },
}));
