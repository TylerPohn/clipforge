/**
 * CompositeCanvas Component
 *
 * Renders multiple video tracks composited together on a canvas.
 * Each track is rendered as a separate video element with its own:
 * - Position (x, y)
 * - Opacity
 * - Volume
 * - Visibility
 *
 * Tracks are rendered in z-index order (lowest first, highest on top).
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, IconButton, Typography, Stack } from '@mui/material';
import { PlayArrow, Pause } from '@mui/icons-material';
import { Track } from '../types/clip';
import { getVisibleTracksSorted } from '../utils/trackUtils';
import { useAudioMixing } from '../hooks/useAudioMixing';
import { useMemoryMonitor } from '../hooks/useMemoryMonitor';
import { useTrackPriority } from '../hooks/useTrackPriority';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

// Import Tauri's convertFileSrc function
import { convertFileSrc } from '@tauri-apps/api/core';

interface CompositeCanvasProps {
  tracks: Track[];
  selectedTrackId?: string;
  soloTrackId?: string;
  isPlaying: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onSelectTrack: (trackId: string) => void;
  onUpdateTrackPosition: (trackId: string, x: number, y: number) => void;
}

interface VideoElement extends HTMLVideoElement {
  trackId: string;
}

export function CompositeCanvas({
  tracks,
  selectedTrackId,
  soloTrackId,
  isPlaying,
  currentTime,
  onPlayPause,
  onSelectTrack,
  onUpdateTrackPosition
}: CompositeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefsMap = useRef<Map<string, VideoElement>>(new Map());
  const [videoSources, setVideoSources] = useState<Map<string, string>>(new Map());
  const loadedTrackIdsRef = useRef<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragTrackId, setDragTrackId] = useState<string | null>(null);

  // Memory monitoring for Phase 2
  const { isHighMemory, memoryUsage, formatMemory } = useMemoryMonitor();

  // Phase 3: Track Prioritization
  const prioritizedTracks = useTrackPriority(tracks, selectedTrackId);

  // Phase 1: Lazy Loading State
  const [isLoadingVideo, setIsLoadingVideo] = useState<Map<string, boolean>>(new Map());

  // Helper to determine if video should be loaded
  const shouldLoadVideo = useCallback((track: Track) => {
    return track.isVisible; // Only load visible tracks
  }, []);

  // Audio mixing for multi-track playback
  const { resumeAudioContext } = useAudioMixing({
    videoElements: videoRefsMap.current,
    tracks,
    soloTrackId
  });

  // Get setCompositeCurrentTime from store to update playhead during playback
  const setCompositeCurrentTime = useVideoStore((state) => state.setCompositeCurrentTime);

  // Load video files for each track
  useEffect(() => {
    const currentTrackIds = new Set(tracks.map(t => t.id));

    // Clean up removed tracks
    setVideoSources(prevSources => {
      const newSources = new Map(prevSources);
      const removedBlobUrls: string[] = [];

      prevSources.forEach((url, trackId) => {
        if (!currentTrackIds.has(trackId)) {
          console.log('[CompositeCanvas] Removing blob URL for deleted track:', trackId);
          removedBlobUrls.push(url);
          newSources.delete(trackId);
          loadedTrackIdsRef.current.delete(trackId);
        }
      });

      // Revoke blob URLs for removed tracks
      removedBlobUrls.forEach(url => URL.revokeObjectURL(url));

      return newSources;
    });

    // Load new tracks or newly-visible tracks
    // Use prioritizedTracks to load selected/visible tracks first
    const loadNewTracks = async () => {
      for (const track of prioritizedTracks) {
        const isLoaded = loadedTrackIdsRef.current.has(track.id);
        const isVisible = shouldLoadVideo(track);

        // Load if: visible AND not loaded
        if (!isVisible) {
          console.log('[CompositeCanvas] Skipping hidden track:', track.id);
          continue;
        }

        // Skip if already loaded or loading
        if (isLoaded) continue;

        // Mark as loading to prevent duplicate loads
        setIsLoadingVideo(prev => new Map(prev).set(track.id, true));
        loadedTrackIdsRef.current.add(track.id);

        try {
          if (!window.__TAURI_INVOKE__) {
            console.error('[CompositeCanvas] Tauri invoke not available');
            loadedTrackIdsRef.current.delete(track.id);
            setIsLoadingVideo(prev => {
              const updated = new Map(prev);
              updated.delete(track.id);
              return updated;
            });
            continue;
          }

          const invoke = window.__TAURI_INVOKE__;
          console.log('[CompositeCanvas] Loading video for track:', track.id, track.clipData.path);

          // Check if custom protocol is available
          const supportsVideoProtocol = window.__TAURI_INVOKE__ !== undefined;

          let videoUrl: string;

          if (supportsVideoProtocol) {
            try {
              // Use streaming via custom protocol
              const filePath = (await invoke('get_video_file_path', {
                videoPath: track.clipData.path
              })) as string;

              // Use Tauri's convertFileSrc to properly format the URL
              videoUrl = convertFileSrc(filePath, 'video');
              console.log('[CompositeCanvas] Using streaming for track:', track.id);
              console.log('[CompositeCanvas] File path:', filePath);
              console.log('[CompositeCanvas] Video URL:', videoUrl);
            } catch (err) {
              console.warn('[CompositeCanvas] Streaming failed, falling back to blob:', err);
              // Fallback to blob loading
              const videoBytes = (await invoke('get_video_file', {
                videoPath: track.clipData.path
              })) as number[];

              const uint8Array = new Uint8Array(videoBytes);
              const blob = new Blob([uint8Array], { type: 'video/mp4' });
              videoUrl = URL.createObjectURL(blob);
              console.log('[CompositeCanvas] Using blob for track:', track.id);
            }
          } else {
            // Fallback to blob loading (old method)
            const videoBytes = (await invoke('get_video_file', {
              videoPath: track.clipData.path
            })) as number[];

            const uint8Array = new Uint8Array(videoBytes);
            const blob = new Blob([uint8Array], { type: 'video/mp4' });
            videoUrl = URL.createObjectURL(blob);
            console.log('[CompositeCanvas] Using blob for track:', track.id);
          }

          setVideoSources(prevSources => {
            const updated = new Map(prevSources);
            updated.set(track.id, videoUrl);
            return updated;
          });

          console.log('[CompositeCanvas] Loaded video for track:', track.id);
        } catch (e) {
          console.error('[CompositeCanvas] Failed to load video for track:', track.id, e);
          loadedTrackIdsRef.current.delete(track.id);
        } finally {
          setIsLoadingVideo(prev => {
            const updated = new Map(prev);
            updated.delete(track.id);
            return updated;
          });
        }
      }
    };

    loadNewTracks();
  }, [tracks, shouldLoadVideo, prioritizedTracks]);

  // Phase 1: Unload videos for hidden tracks
  useEffect(() => {
    const unloadHiddenTracks = () => {
      const currentTrackMap = new Map(tracks.map(t => [t.id, t]));

      videoSources.forEach((url, trackId) => {
        const track = currentTrackMap.get(trackId);

        // Unload if track is hidden
        if (track && !shouldLoadVideo(track)) {
          console.log('[CompositeCanvas] Unloading hidden track:', trackId);

          // Revoke blob URL to free memory
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
          }

          // Remove from state
          setVideoSources(prev => {
            const updated = new Map(prev);
            updated.delete(trackId);
            return updated;
          });

          // Remove from loaded set
          loadedTrackIdsRef.current.delete(trackId);

          // Remove video element reference
          videoRefsMap.current.delete(trackId);
        }
      });
    };

    unloadHiddenTracks();
  }, [tracks, videoSources, shouldLoadVideo]);

  // Cleanup all blob URLs only on unmount
  useEffect(() => {
    const currentSources = new Map(videoSources);
    return () => {
      console.log('[CompositeCanvas] Component unmounting, cleaning up all blob URLs');
      currentSources.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array - only cleanup on unmount

  // Sync playback state across all videos
  useEffect(() => {
    const playAll = async () => {
      // Resume audio context if suspended (required for Web Audio API)
      await resumeAudioContext();

      videoRefsMap.current.forEach((video) => {
        if (isPlaying) {
          video.play().catch((err) => {
            console.error('[CompositeCanvas] Play failed for track:', video.trackId, err);
          });
        } else {
          video.pause();
        }
      });
    };

    playAll();
  }, [isPlaying, resumeAudioContext]);

  // Sync current time across all videos
  useEffect(() => {
    videoRefsMap.current.forEach((video) => {
      // Tightened threshold from 500ms to 50ms to prevent perceptible drift
      if (Math.abs(video.currentTime * 1000 - currentTime) > 50) {
        video.currentTime = currentTime / 1000;
      }
    });
  }, [currentTime]);

  // Update currentTime during playback (moves the timeline playhead)
  useEffect(() => {
    if (!isPlaying) return;

    let animationFrameId: number;

    const updatePlayhead = () => {
      // Get first visible video element as time reference
      const firstVideo = Array.from(videoRefsMap.current.values())[0];

      if (firstVideo && !firstVideo.paused) {
        const newTime = firstVideo.currentTime * 1000; // Convert to milliseconds
        setCompositeCurrentTime(newTime);
      }

      animationFrameId = requestAnimationFrame(updatePlayhead);
    };

    animationFrameId = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, setCompositeCurrentTime]);

  // Mute all video elements since audio is handled by Web Audio API
  useEffect(() => {
    videoRefsMap.current.forEach((video) => {
      // Always mute video elements when using Web Audio API
      // Volume control is handled by gain nodes in useAudioMixing
      video.muted = true;
    });
  }, [tracks]);

  // Store stable ref callbacks per track
  const refCallbacks = useRef<Map<string, (el: HTMLVideoElement | null) => void>>(new Map());

  // Cleanup ref callbacks for removed tracks
  useEffect(() => {
    const currentTrackIds = new Set(tracks.map(t => t.id));
    refCallbacks.current.forEach((_, trackId) => {
      if (!currentTrackIds.has(trackId)) {
        refCallbacks.current.delete(trackId);
      }
    });
  }, [tracks]);

  // Get or create a stable ref callback for a track
  const getRefCallback = useCallback((trackId: string) => {
    let callback = refCallbacks.current.get(trackId);
    if (!callback) {
      callback = (element: HTMLVideoElement | null) => {
        if (element) {
          (element as VideoElement).trackId = trackId;
          videoRefsMap.current.set(trackId, element as VideoElement);
        } else {
          videoRefsMap.current.delete(trackId);
        }
      };
      refCallbacks.current.set(trackId, callback);
    }
    return callback;
  }, []);

  // Handle track selection on canvas
  const handleCanvasClick = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    onSelectTrack(trackId);
  };

  // Handle track dragging
  const handleMouseDown = (e: React.MouseEvent, track: Track) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    setDragTrackId(track.id);
    onSelectTrack(track.id);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragTrackId || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;

    onUpdateTrackPosition(dragTrackId, Math.round(newX), Math.round(newY));
  }, [isDragging, dragTrackId, dragOffset, onUpdateTrackPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragTrackId(null);
  }, []);

  // Attach global mouse move/up listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const visibleTracks = getVisibleTracksSorted(tracks);

  if (tracks.length === 0) {
    return (
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
        minHeight: 0
      }}>
        <Typography variant="body1" color="text.secondary">
          No tracks to display
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      position: 'relative',
      minHeight: 0
    }}>
      {/* Memory Warning Banner */}
      {isHighMemory && memoryUsage && (
        <Box sx={{
          backgroundColor: 'warning.main',
          color: 'warning.contrastText',
          p: 1,
          textAlign: 'center'
        }}>
          <Typography variant="body2">
            ⚠️ High memory usage: {formatMemory(memoryUsage.usedJSHeapSize)} / {formatMemory(memoryUsage.jsHeapSizeLimit)}
            {' - Consider hiding unused tracks'}
          </Typography>
        </Box>
      )}

      {/* Canvas Container */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* Center point marker */}
        <Box sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 20,
          height: 20,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 1000
        }}>
          <Box sx={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            transform: 'translateX(-50%)'
          }} />
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            transform: 'translateY(-50%)'
          }} />
        </Box>

        {/* Render all visible tracks */}
        {visibleTracks.map((track) => {
          const videoSrc = videoSources.get(track.id);
          const isSelected = selectedTrackId === track.id;
          const isLoading = isLoadingVideo.get(track.id);

          return (
            <Box
              key={track.id}
              onClick={(e) => handleCanvasClick(e, track.id)}
              onMouseDown={(e) => handleMouseDown(e, track)}
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${track.position.x}px), calc(-50% + ${track.position.y}px))`,
                width: track.clipData.width,
                height: track.clipData.height,
                opacity: track.opacity,
                zIndex: track.zIndex,
                cursor: 'move',
                border: isSelected ? '2px solid' : '1px solid',
                borderColor: isSelected ? 'primary.main' : 'rgba(255, 255, 255, 0.2)',
                boxShadow: isSelected ? '0 0 10px rgba(0, 188, 212, 0.5)' : 'none',
                borderRadius: 0.5,
                overflow: 'hidden',
                transition: isDragging && dragTrackId === track.id ? 'none' : 'border-color 0.2s',
                '&:hover': {
                  borderColor: isSelected ? 'primary.light' : 'rgba(255, 255, 255, 0.5)'
                }
              }}
            >
              {videoSrc ? (
                <video
                  ref={getRefCallback(track.id)}
                  src={videoSrc}
                  preload="metadata"
                  loop={false}
                  muted={false}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    video.currentTime = currentTime / 1000;
                  }}
                />
              ) : (
                <Box sx={{
                  width: track.clipData.width,
                  height: track.clipData.height,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)'
                }}>
                  <Typography variant="caption" color="text.secondary">
                    {isLoading ? 'Loading...' : 'Hidden'}
                  </Typography>
                </Box>
              )}

              {/* Track label */}
              {isSelected && (
                <Box sx={{
                  position: 'absolute',
                  top: -25,
                  left: 0,
                  backgroundColor: 'primary.main',
                  color: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  pointerEvents: 'none'
                }}>
                  {track.name}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Play/Pause Overlay */}
        {!isPlaying && (
          <Box
            onClick={onPlayPause}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              transition: 'background-color 0.2s',
              zIndex: 500,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.5)'
              }
            }}
          >
            <PlayArrow sx={{ fontSize: 80, color: 'white' }} />
          </Box>
        )}
      </Box>

      {/* Control Bar */}
      <Box sx={{
        height: 60,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        px: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <IconButton onClick={onPlayPause} color="primary" size="large">
          {isPlaying ? <Pause /> : <PlayArrow />}
        </IconButton>

        <Stack>
          <Typography variant="body2">
            {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {visibleTracks.length} visible
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

export default CompositeCanvas;
