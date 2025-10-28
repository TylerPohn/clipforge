/**
 * Multi-Track Compositing Types
 *
 * This file defines the data structures for the multi-track architecture,
 * where each imported clip exists as a separate, independently-editable track
 * that can be played back individually or composited together.
 */

/**
 * ClipData represents the raw video/audio data from an imported file
 */
export interface ClipData {
  id: string;
  path: string;
  name: string;
  duration: number;  // in milliseconds
  width: number;
  height: number;
  frameRate?: number;
  hasAudio?: boolean;
}

/**
 * Track represents a single layer in the composition
 * Each track has its own positioning, audio, and visual properties
 */
export interface Track {
  // Identity
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

/**
 * CompositeState manages the collection of tracks and composite playback
 */
export interface CompositeState {
  tracks: Track[];
  selectedTrackId?: string;            // Currently selected track for editing
  soloTrackId?: string;                // Solo track (only this track's audio plays)
  isPlayingComposite: boolean;         // Playing all tracks together
  currentTime: number;                 // Playhead position (ms)
}

/**
 * Type guard to check if an object is a valid Track
 */
export function isTrack(obj: any): obj is Track {
  return (
    typeof obj === 'object' &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.clipData === 'object' &&
    typeof obj.position === 'object' &&
    typeof obj.position.x === 'number' &&
    typeof obj.position.y === 'number' &&
    typeof obj.volume === 'number' &&
    typeof obj.opacity === 'number' &&
    typeof obj.zIndex === 'number' &&
    typeof obj.isVisible === 'boolean' &&
    typeof obj.offset === 'number' &&
    typeof obj.duration === 'number'
  );
}
