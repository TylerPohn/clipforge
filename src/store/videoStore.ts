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

  // Playback state
  isPlaying: boolean;
  currentTime: number;
  volume: number;

  // Methods to update state
  setVideo: (path: string, name: string) => void;
  setMetadata: (duration: number, resolution: { width: number; height: number }) => void;
  setTrimPoints: (start: number, end: number) => void;
  clearVideo: () => void;

  // Playback methods
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setVolume: (volume: number) => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  // Initial state
  videoPath: null,
  videoName: null,
  videoDuration: null,
  videoResolution: null,
  trimStart: 0,
  trimEnd: 0,
  isPlaying: false,
  currentTime: 0,
  volume: 1.0,

  // Actions
  setVideo: (path, name) => {
    console.log('[VideoStore] Setting video:', { path, name });
    set({
      videoPath: path,
      videoName: name,
      isPlaying: false,
      currentTime: 0
    });
  },

  setMetadata: (duration, resolution) => {
    console.log('[VideoStore] Setting metadata:', { duration, resolution });
    set({
      videoDuration: duration,
      videoResolution: resolution,
      trimStart: 0,
      trimEnd: duration
    });
  },

  setTrimPoints: (start, end) => {
    // Validation
    const state = useVideoStore.getState();
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

  // Playback actions
  setPlaying: (playing) => {
    console.log('[VideoStore] Setting playing:', playing);
    set({ isPlaying: playing });
  },
  setCurrentTime: (time) => set({ currentTime: time }),
  setVolume: (volume) => set({ volume: volume }),
}));
