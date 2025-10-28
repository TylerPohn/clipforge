/**
 * useAudioMixing Hook
 *
 * Manages Web Audio API for mixing multiple video tracks.
 * Creates audio graph: video elements -> gain nodes -> output
 * Supports per-track volume control and solo functionality.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Track } from '../types/clip';

interface AudioNode {
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
}

interface UseAudioMixingOptions {
  videoElements: Map<string, HTMLVideoElement>;
  tracks: Track[];
  soloTrackId?: string;
}

export function useAudioMixing({ videoElements, tracks, soloTrackId }: UseAudioMixingOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, AudioNode>>(new Map());
  const connectedElementsRef = useRef<Set<string>>(new Set());

  // Initialize audio context
  useEffect(() => {
    if (!audioContextRef.current) {
      // Create audio context (use webkit prefix for Safari)
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();
      console.log('[useAudioMixing] Audio context initialized');
    }

    return () => {
      // Cleanup: disconnect all nodes
      audioNodesRef.current.forEach((node) => {
        try {
          node.sourceNode.disconnect();
          node.gainNode.disconnect();
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      audioNodesRef.current.clear();
      connectedElementsRef.current.clear();
    };
  }, []);

  // Create audio nodes for video elements
  useEffect(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Process each video element
    videoElements.forEach((videoElement, trackId) => {
      // Skip if already connected
      if (connectedElementsRef.current.has(trackId)) return;

      // Skip if track doesn't exist
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;

      try {
        // Mute the video element itself (audio will play through Web Audio API)
        videoElement.muted = true;

        // Create audio source from video element
        const sourceNode = audioContext.createMediaElementSource(videoElement);

        // Create gain node for volume control
        const gainNode = audioContext.createGain();
        gainNode.gain.value = track.volume;

        // Connect: source -> gain -> output
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Store nodes
        audioNodesRef.current.set(trackId, { sourceNode, gainNode });
        connectedElementsRef.current.add(trackId);

        console.log('[useAudioMixing] Connected audio for track:', trackId);
      } catch (e) {
        console.error('[useAudioMixing] Failed to connect audio for track:', trackId, e);
      }
    });

    // Clean up removed tracks
    const currentTrackIds = new Set(Array.from(videoElements.keys()));
    audioNodesRef.current.forEach((node, trackId) => {
      if (!currentTrackIds.has(trackId)) {
        try {
          node.sourceNode.disconnect();
          node.gainNode.disconnect();
          audioNodesRef.current.delete(trackId);
          connectedElementsRef.current.delete(trackId);
          console.log('[useAudioMixing] Disconnected audio for removed track:', trackId);
        } catch (e) {
          console.error('[useAudioMixing] Error disconnecting track:', trackId, e);
        }
      }
    });
  }, [videoElements, tracks]);

  // Update volumes and solo state
  useEffect(() => {
    tracks.forEach(track => {
      const audioNode = audioNodesRef.current.get(track.id);
      if (!audioNode) return;

      // Apply solo: mute all except solo track
      if (soloTrackId) {
        if (track.id === soloTrackId) {
          audioNode.gainNode.gain.value = track.volume;
        } else {
          audioNode.gainNode.gain.value = 0;
        }
      } else {
        // Normal mode: use track's volume
        audioNode.gainNode.gain.value = track.volume;
      }
    });
  }, [tracks, soloTrackId]);

  // Update individual track volume
  const updateTrackVolume = useCallback((trackId: string, volume: number) => {
    const audioNode = audioNodesRef.current.get(trackId);
    if (audioNode) {
      audioNode.gainNode.gain.value = volume;
    }
  }, []);

  // Resume audio context (required after user interaction on some browsers)
  const resumeAudioContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
      console.log('[useAudioMixing] Audio context resumed');
    }
  }, []);

  return {
    updateTrackVolume,
    resumeAudioContext,
    audioContext: audioContextRef.current
  };
}
