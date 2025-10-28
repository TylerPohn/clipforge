import { useMemo } from 'react';
import { Track } from '../types/clip';

/**
 * Hook to prioritize track loading order
 *
 * Priority order:
 * 1. Selected track (highest priority)
 * 2. Other visible tracks
 * 3. Hidden tracks (lowest priority, should not be loaded)
 *
 * This ensures the most important tracks (selected, visible) load first
 * and improves perceived performance.
 */
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
