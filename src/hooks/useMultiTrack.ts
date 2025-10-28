/**
 * useMultiTrack Hook
 *
 * Custom hook for managing multi-track composition operations
 * Provides a convenient interface to the track management functions in the store
 */

import { useCallback } from 'react';
import { useVideoStore } from '../store/videoStore';
import { ClipData, Track } from '../types/clip';

export function useMultiTrack() {
  // Get the entire store (we'll use selectors for specific parts)
  const composite = useVideoStore((state) => state.composite);
  const addTrack = useVideoStore((state) => state.addTrack);
  const removeTrack = useVideoStore((state) => state.removeTrack);
  const selectTrack = useVideoStore((state) => state.selectTrack);
  const reorderTrack = useVideoStore((state) => state.reorderTrack);
  const updateTrackProperty = useVideoStore((state) => state.updateTrackProperty);
  const updateTrackPosition = useVideoStore((state) => state.updateTrackPosition);
  const updateTrackVolume = useVideoStore((state) => state.updateTrackVolume);
  const updateTrackOpacity = useVideoStore((state) => state.updateTrackOpacity);
  const updateTrackOffset = useVideoStore((state) => state.updateTrackOffset);
  const toggleTrackVisibility = useVideoStore((state) => state.toggleTrackVisibility);
  const setCompositePlaybackState = useVideoStore((state) => state.setCompositePlaybackState);
  const setCompositeCurrentTime = useVideoStore((state) => state.setCompositeCurrentTime);
  const toggleSoloTrack = useVideoStore((state) => state.toggleSoloTrack);

  /**
   * Add a new track from clip data
   */
  const handleAddTrack = useCallback((clipData: ClipData) => {
    addTrack(clipData);
  }, [addTrack]);

  /**
   * Remove a track by ID
   */
  const handleRemoveTrack = useCallback((trackId: string) => {
    removeTrack(trackId);
  }, [removeTrack]);

  /**
   * Select a track for editing
   */
  const handleSelectTrack = useCallback((trackId: string) => {
    selectTrack(trackId);
  }, [selectTrack]);

  /**
   * Reorder a track to a new position
   */
  const handleReorderTrack = useCallback((trackId: string, newIndex: number) => {
    reorderTrack(trackId, newIndex);
  }, [reorderTrack]);

  /**
   * Update any track property
   */
  const handleUpdateTrackProperty = useCallback(<K extends keyof Track>(
    trackId: string,
    property: K,
    value: Track[K]
  ) => {
    updateTrackProperty(trackId, property, value);
  }, [updateTrackProperty]);

  /**
   * Update track position on canvas
   */
  const handleUpdateTrackPosition = useCallback((trackId: string, x: number, y: number) => {
    updateTrackPosition(trackId, x, y);
  }, [updateTrackPosition]);

  /**
   * Update track volume (0-1)
   */
  const handleUpdateTrackVolume = useCallback((trackId: string, volume: number) => {
    updateTrackVolume(trackId, volume);
  }, [updateTrackVolume]);

  /**
   * Update track opacity (0-1)
   */
  const handleUpdateTrackOpacity = useCallback((trackId: string, opacity: number) => {
    updateTrackOpacity(trackId, opacity);
  }, [updateTrackOpacity]);

  /**
   * Update track offset (time position in milliseconds)
   */
  const handleUpdateTrackOffset = useCallback((trackId: string, offset: number) => {
    updateTrackOffset(trackId, offset);
  }, [updateTrackOffset]);

  /**
   * Toggle track visibility
   */
  const handleToggleTrackVisibility = useCallback((trackId: string) => {
    toggleTrackVisibility(trackId);
  }, [toggleTrackVisibility]);

  /**
   * Toggle solo for a track (only this track's audio plays)
   */
  const handleToggleSoloTrack = useCallback((trackId: string) => {
    toggleSoloTrack(trackId);
  }, [toggleSoloTrack]);

  /**
   * Get the currently selected track
   */
  const getSelectedTrack = useCallback((): Track | undefined => {
    if (!composite.selectedTrackId) return undefined;
    return composite.tracks.find(track => track.id === composite.selectedTrackId);
  }, [composite.tracks, composite.selectedTrackId]);

  /**
   * Play all visible tracks together (composite playback)
   */
  const playComposite = useCallback(() => {
    setCompositePlaybackState(true);
  }, [setCompositePlaybackState]);

  /**
   * Pause composite playback
   */
  const pauseComposite = useCallback(() => {
    setCompositePlaybackState(false);
  }, [setCompositePlaybackState]);

  /**
   * Seek to a specific time in composite playback
   */
  const seekComposite = useCallback((time: number) => {
    setCompositeCurrentTime(time);
  }, [setCompositeCurrentTime]);

  /**
   * Check if there are any tracks
   */
  const hasTracks = composite.tracks.length > 0;

  /**
   * Get the number of visible tracks
   */
  const visibleTrackCount = composite.tracks.filter(track => track.isVisible).length;

  /**
   * Get all visible tracks sorted by z-index
   */
  const visibleTracks = composite.tracks
    .filter(track => track.isVisible)
    .sort((a, b) => a.zIndex - b.zIndex);

  return {
    // State
    tracks: composite.tracks,
    selectedTrackId: composite.selectedTrackId,
    soloTrackId: composite.soloTrackId,
    selectedTrack: getSelectedTrack(),
    isPlayingComposite: composite.isPlayingComposite,
    currentTime: composite.currentTime,
    hasTracks,
    visibleTrackCount,
    visibleTracks,

    // Track Management
    addTrack: handleAddTrack,
    removeTrack: handleRemoveTrack,
    selectTrack: handleSelectTrack,
    reorderTrack: handleReorderTrack,

    // Property Updates
    updateTrackProperty: handleUpdateTrackProperty,
    updateTrackPosition: handleUpdateTrackPosition,
    updateTrackVolume: handleUpdateTrackVolume,
    updateTrackOpacity: handleUpdateTrackOpacity,
    updateTrackOffset: handleUpdateTrackOffset,
    toggleTrackVisibility: handleToggleTrackVisibility,
    toggleSoloTrack: handleToggleSoloTrack,

    // Playback
    playComposite,
    pauseComposite,
    seekComposite,
  };
}
