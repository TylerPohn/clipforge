/**
 * Track Utility Functions
 *
 * Helper functions for working with tracks in the multi-track composition system
 */

import { v4 as uuidv4 } from 'uuid';
import { Track, ClipData } from '../types/clip';

/**
 * Generate a track name based on the current track count
 * @param trackCount - Number of existing tracks
 * @returns Generated name like "Clip 1", "Clip 2", etc.
 */
export function generateTrackName(trackCount: number): string {
  return `Clip ${trackCount + 1}`;
}

/**
 * Create a unique track ID
 * @returns UUID string
 */
export function createTrackId(): string {
  return uuidv4();
}

/**
 * Create a new track from clip data with default properties
 * @param clipData - The clip data to create a track from
 * @param trackCount - Current number of tracks (for naming and positioning)
 * @returns A new Track object with default properties
 */
export function createTrack(clipData: ClipData, trackCount: number): Track {
  return {
    id: createTrackId(),
    name: generateTrackName(trackCount),
    clipData,
    position: {
      x: 0,
      y: trackCount * 50  // Offset vertically for each new track
    },
    volume: 1.0,
    opacity: 1.0,
    zIndex: trackCount,
    isVisible: true,
    offset: 0,
    duration: clipData.duration,
    createdAt: new Date(),
    sourceFile: clipData.path
  };
}

/**
 * Find a track by ID in an array of tracks
 * @param tracks - Array of tracks to search
 * @param trackId - ID of the track to find
 * @returns The track if found, undefined otherwise
 */
export function findTrackById(tracks: Track[], trackId: string): Track | undefined {
  return tracks.find(track => track.id === trackId);
}

/**
 * Get the index of a track in an array
 * @param tracks - Array of tracks to search
 * @param trackId - ID of the track to find
 * @returns The index of the track, or -1 if not found
 */
export function getTrackIndex(tracks: Track[], trackId: string): number {
  return tracks.findIndex(track => track.id === trackId);
}

/**
 * Reorder a track to a new index in the array
 * @param tracks - Array of tracks
 * @param trackId - ID of the track to reorder
 * @param newIndex - New position for the track
 * @returns New array with reordered tracks
 */
export function reorderTrack(tracks: Track[], trackId: string, newIndex: number): Track[] {
  const currentIndex = getTrackIndex(tracks, trackId);

  if (currentIndex === -1) {
    console.error('[trackUtils] Track not found:', trackId);
    return tracks;
  }

  if (newIndex < 0 || newIndex >= tracks.length) {
    console.error('[trackUtils] Invalid new index:', newIndex);
    return tracks;
  }

  const newTracks = [...tracks];
  const [track] = newTracks.splice(currentIndex, 1);
  newTracks.splice(newIndex, 0, track);

  // Update zIndex to match new array positions
  return newTracks.map((track, index) => ({
    ...track,
    zIndex: index
  }));
}

/**
 * Update a specific property of a track
 * @param tracks - Array of tracks
 * @param trackId - ID of the track to update
 * @param property - Property name to update
 * @param value - New value for the property
 * @returns New array with updated track
 */
export function updateTrackProperty<K extends keyof Track>(
  tracks: Track[],
  trackId: string,
  property: K,
  value: Track[K]
): Track[] {
  const trackIndex = getTrackIndex(tracks, trackId);

  if (trackIndex === -1) {
    console.error('[trackUtils] Track not found:', trackId);
    return tracks;
  }

  const newTracks = [...tracks];
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    [property]: value
  };

  return newTracks;
}

/**
 * Remove a track from the array
 * @param tracks - Array of tracks
 * @param trackId - ID of the track to remove
 * @returns New array without the removed track
 */
export function removeTrack(tracks: Track[], trackId: string): Track[] {
  return tracks.filter(track => track.id !== trackId);
}

/**
 * Get all visible tracks sorted by z-index for rendering
 * @param tracks - Array of tracks
 * @returns Array of visible tracks sorted by z-index (lowest first)
 */
export function getVisibleTracksSorted(tracks: Track[]): Track[] {
  return tracks
    .filter(track => track.isVisible)
    .sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Calculate the total duration of all tracks
 * (considering the longest track with offset)
 * @param tracks - Array of tracks
 * @returns Total duration in milliseconds
 */
export function calculateTotalDuration(tracks: Track[]): number {
  if (tracks.length === 0) return 0;

  return Math.max(...tracks.map(track => track.offset + track.duration));
}

/**
 * Check if a position is within a track's bounds
 * @param track - The track to check
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns true if position is within track bounds
 */
export function isPositionInTrack(track: Track, x: number, y: number): boolean {
  const { position, clipData } = track;

  return (
    x >= position.x &&
    x <= position.x + clipData.width &&
    y >= position.y &&
    y <= position.y + clipData.height
  );
}

/**
 * Get the track at a specific position (returns topmost visible track)
 * @param tracks - Array of tracks
 * @param x - X coordinate
 * @param y - Y coordinate
 * @returns The topmost track at this position, or undefined
 */
export function getTrackAtPosition(tracks: Track[], x: number, y: number): Track | undefined {
  // Get visible tracks sorted by z-index (highest first for hit detection)
  const sortedTracks = getVisibleTracksSorted(tracks).reverse();

  return sortedTracks.find(track => isPositionInTrack(track, x, y));
}
