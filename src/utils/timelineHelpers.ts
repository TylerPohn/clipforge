/**
 * Timeline utility functions for drag-and-drop operations
 * Handles position calculations and clip insertion logic
 */

import { Clip } from '../store/videoStore';

/**
 * Converts a pixel X position to time in seconds
 * @param x - Pixel position along timeline
 * @param totalWidth - Total width of timeline in pixels
 * @param duration - Total duration of timeline in seconds
 * @returns Time in seconds
 */
export function pixelToTime(x: number, totalWidth: number, duration: number): number {
  if (totalWidth === 0) return 0;
  const time = (x / totalWidth) * duration;
  return Math.max(0, Math.min(time, duration));
}

/**
 * Converts a time in seconds to pixel X position
 * @param time - Time in seconds
 * @param totalWidth - Total width of timeline in pixels
 * @param duration - Total duration of timeline in seconds
 * @returns Pixel position along timeline
 */
export function timeToPixel(time: number, totalWidth: number, duration: number): number {
  if (duration === 0) return 0;
  return (time / duration) * totalWidth;
}

/**
 * Finds the insertion index in the clips array based on drop time
 * Clips are ordered by startTimeInSequence, so we find where the new clip should go
 * @param clips - Current clips array
 * @param dropTime - Time where clip should be inserted
 * @returns Index where clip should be inserted
 */
export function findInsertionIndex(clips: Clip[], dropTime: number): number {
  // If no clips, insert at beginning
  if (clips.length === 0) return 0;

  // Find the first clip whose start time is after the drop time
  for (let i = 0; i < clips.length; i++) {
    if (clips[i].startTimeInSequence > dropTime) {
      return i;
    }
  }

  // If drop time is after all clips, insert at end
  return clips.length;
}

/**
 * Formats time in seconds to MM:SS.mmm format for display
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTimeWithMillis(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

/**
 * Checks if a drop position is valid (within timeline bounds)
 * @param time - Drop time in seconds
 * @param duration - Total timeline duration
 * @returns True if position is valid
 */
export function isValidDropPosition(time: number, duration: number): boolean {
  return time >= 0 && time <= duration;
}

/**
 * Generates a unique clip ID for copied clips
 * @param originalId - Original clip ID
 * @returns New unique ID
 */
export function generateClipCopyId(originalId: string): string {
  return `${originalId}-copy-${Date.now()}`;
}
