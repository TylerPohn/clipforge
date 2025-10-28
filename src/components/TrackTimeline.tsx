/**
 * TrackTimeline Component (Enhanced)
 *
 * Displays a multi-track timeline view where each track is shown as a horizontal row.
 * Features:
 * - Vertical stacking of tracks
 * - Horizontal panning and zooming
 * - Drag tracks horizontally to change their start time (offset)
 * - Playhead indicator
 * - Click to seek
 * - Individual track visualization
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, Stack, IconButton, Chip, Tooltip, ButtonGroup, Button } from '@mui/material';
import { PlayArrow, Pause, ZoomIn, ZoomOut, FitScreen } from '@mui/icons-material';
import { Track } from '../types/clip';
import { calculateTotalDuration } from '../utils/trackUtils';

interface TrackTimelineProps {
  tracks: Track[];
  selectedTrackId?: string;
  isPlaying: boolean;
  currentTime: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSelectTrack: (trackId: string) => void;
  onUpdateTrackOffset?: (trackId: string, offset: number) => void;
}

const TRACK_HEIGHT = 50;
const HEADER_HEIGHT = 40;
const MIN_PIXELS_PER_MS = 0.02; // Minimum zoom: 20px per second
const MAX_PIXELS_PER_MS = 0.5;  // Maximum zoom: 500px per second
const DEFAULT_PIXELS_PER_MS = 0.1; // Default: 100px per second

export function TrackTimeline({
  tracks,
  selectedTrackId,
  isPlaying,
  currentTime,
  onPlayPause,
  onSeek,
  onSelectTrack,
  onUpdateTrackOffset
}: TrackTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Timeline state
  const [scrollX, setScrollX] = useState(0);
  const [pixelsPerMs, setPixelsPerMs] = useState(DEFAULT_PIXELS_PER_MS);

  // Interaction state
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingTrack, setIsDraggingTrack] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartScrollX, setPanStartScrollX] = useState(0);

  const totalDuration = Math.max(calculateTotalDuration(tracks) || 10000, 10000);

  // Format time as MM:SS.ms
  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${millis}`;
  };

  // Convert screen X to timeline time
  const screenXToTime = useCallback((screenX: number) => {
    return (screenX + scrollX) / pixelsPerMs;
  }, [scrollX, pixelsPerMs]);

  // Convert timeline time to screen X
  const timeToScreenX = useCallback((time: number) => {
    return time * pixelsPerMs - scrollX;
  }, [scrollX, pixelsPerMs]);

  // Zoom controls
  const handleZoomIn = () => {
    setPixelsPerMs(prev => Math.min(prev * 1.5, MAX_PIXELS_PER_MS));
  };

  const handleZoomOut = () => {
    setPixelsPerMs(prev => Math.max(prev / 1.5, MIN_PIXELS_PER_MS));
  };

  const handleZoomFit = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const newPixelsPerMs = containerWidth / totalDuration;
    setPixelsPerMs(Math.max(MIN_PIXELS_PER_MS, Math.min(newPixelsPerMs, MAX_PIXELS_PER_MS)));
    setScrollX(0);
  };

  // Draw timeline on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || tracks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // Calculate visible time range
    const visibleStartTime = screenXToTime(0);
    const visibleEndTime = screenXToTime(width);

    // Draw tracks
    tracks.forEach((track, index) => {
      const y = index * TRACK_HEIGHT;
      const isSelected = selectedTrackId === track.id;

      // Track background
      ctx.fillStyle = isSelected
        ? 'rgba(0, 188, 212, 0.15)'
        : index % 2 === 0
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, y, width, TRACK_HEIGHT);

      // Track border
      ctx.strokeStyle = isSelected
        ? 'rgba(0, 188, 212, 0.5)'
        : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(0, y, width, TRACK_HEIGHT);

      // Calculate track clip position
      const trackStart = track.offset;
      const trackEnd = track.offset + track.duration;

      // Only draw if track is visible in viewport
      if (trackEnd > visibleStartTime && trackStart < visibleEndTime) {
        const startX = timeToScreenX(trackStart);
        const endX = timeToScreenX(trackEnd);
        const clipWidth = endX - startX;

        // Draw clip
        if (track.isVisible) {
          ctx.fillStyle = draggedTrackId === track.id
            ? 'rgba(0, 188, 212, 0.6)'
            : 'rgba(0, 188, 212, 0.4)';
        } else {
          ctx.fillStyle = 'rgba(150, 150, 150, 0.3)';
        }
        ctx.fillRect(startX, y + 5, clipWidth, TRACK_HEIGHT - 10);

        // Clip border
        ctx.strokeStyle = track.isVisible
          ? 'rgba(0, 188, 212, 0.8)'
          : 'rgba(150, 150, 150, 0.6)';
        ctx.lineWidth = draggedTrackId === track.id ? 3 : 2;
        ctx.strokeRect(startX, y + 5, clipWidth, TRACK_HEIGHT - 10);

        // Draw track name (if clip is wide enough)
        if (clipWidth > 40) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = '11px sans-serif';
          ctx.textBaseline = 'middle';
          const maxChars = Math.floor(clipWidth / 7);
          const trackName = track.name.length > maxChars ? track.name.substring(0, maxChars - 3) + '...' : track.name;
          ctx.fillText(trackName, startX + 8, y + TRACK_HEIGHT / 2);
        }

        // Draw duration (if clip is wide enough)
        if (clipWidth > 60) {
          const durationText = `${(track.duration / 1000).toFixed(1)}s`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(durationText, endX - 8, y + TRACK_HEIGHT / 2);
          ctx.textAlign = 'left';
        }
      }
    });

    // Draw time markers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.textBaseline = 'top';

    // Determine marker interval based on zoom level
    const markerIntervalMs = Math.max(1000, Math.pow(10, Math.floor(Math.log10(width / pixelsPerMs / 10)))) * 1000;

    const startMarker = Math.floor(visibleStartTime / markerIntervalMs) * markerIntervalMs;
    for (let i = startMarker; i <= visibleEndTime; i += markerIntervalMs) {
      const x = timeToScreenX(i);
      if (x >= 0 && x <= width) {
        // Draw marker line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw time label
        ctx.fillText(formatTime(i), x + 2, 2);
      }
    }

    // Draw playhead (on top of everything)
    const playheadX = timeToScreenX(currentTime);
    if (playheadX >= 0 && playheadX <= width) {
      ctx.strokeStyle = '#ff4081';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead handle
      ctx.fillStyle = '#ff4081';
      ctx.fillRect(playheadX - 4, 0, 8, 12);
    }

  }, [tracks, selectedTrackId, currentTime, totalDuration, scrollX, pixelsPerMs, screenXToTime, timeToScreenX, draggedTrackId]);

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = tracks.length * TRACK_HEIGHT;
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [tracks.length]);

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const time = screenXToTime(screenX);

    // Check if clicked on playhead
    const playheadScreenX = timeToScreenX(currentTime);
    if (Math.abs(screenX - playheadScreenX) < 8 && screenY < 12) {
      setIsDraggingPlayhead(true);
      return;
    }

    // Check if clicked on a track clip
    const trackIndex = Math.floor(screenY / TRACK_HEIGHT);
    if (trackIndex >= 0 && trackIndex < tracks.length) {
      const track = tracks[trackIndex];
      const trackStart = track.offset;
      const trackEnd = track.offset + track.duration;

      if (time >= trackStart && time <= trackEnd) {
        // Clicked on track clip - start dragging
        onSelectTrack(track.id);
        setIsDraggingTrack(true);
        setDraggedTrackId(track.id);
        setDragStartX(screenX);
        setDragStartOffset(track.offset);
        return;
      } else {
        // Clicked on empty track area
        onSelectTrack(track.id);
      }
    }

    // Start panning (middle mouse or Ctrl+click or click on empty space)
    if (e.button === 1 || e.ctrlKey || e.metaKey) {
      setIsPanning(true);
      setPanStartX(e.clientX);
      setPanStartScrollX(scrollX);
    } else {
      // Seek to clicked position
      onSeek(Math.max(0, time));
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;

    if (isDraggingPlayhead) {
      const time = screenXToTime(screenX);
      onSeek(Math.max(0, Math.min(totalDuration, time)));
    } else if (isDraggingTrack && draggedTrackId && onUpdateTrackOffset) {
      const deltaX = screenX - dragStartX;
      const deltaTime = deltaX / pixelsPerMs;
      const newOffset = Math.max(0, dragStartOffset + deltaTime);
      onUpdateTrackOffset(draggedTrackId, newOffset);
    } else if (isPanning) {
      const deltaX = e.clientX - panStartX;
      const newScrollX = Math.max(0, panStartScrollX - deltaX);
      setScrollX(newScrollX);
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setIsDraggingPlayhead(false);
    setIsDraggingTrack(false);
    setDraggedTrackId(null);
    setIsPanning(false);
  };

  // Handle wheel for zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setPixelsPerMs(prev => Math.max(MIN_PIXELS_PER_MS, Math.min(prev * delta, MAX_PIXELS_PER_MS)));
    } else {
      // Scroll horizontally
      const delta = e.deltaY;
      setScrollX(prev => Math.max(0, prev + delta));
    }
  };

  if (tracks.length === 0) {
    return (
      <Box sx={{
        height: 140,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Typography variant="body2" color="text.secondary">
          Track timeline will appear here
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: Math.min(400, HEADER_HEIGHT + tracks.length * TRACK_HEIGHT + 20),
      backgroundColor: 'background.paper',
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <Box sx={{
        height: HEADER_HEIGHT,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)'
      }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={onPlayPause} size="small" color="primary">
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <Typography variant="subtitle2">
            Multi-Track Timeline
          </Typography>
          <Chip
            label={`${tracks.length} track${tracks.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center">
          {/* Zoom controls */}
          <ButtonGroup size="small" variant="outlined">
            <Tooltip title="Zoom out">
              <Button onClick={handleZoomOut}>
                <ZoomOut fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Fit timeline">
              <Button onClick={handleZoomFit}>
                <FitScreen fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Zoom in">
              <Button onClick={handleZoomIn}>
                <ZoomIn fontSize="small" />
              </Button>
            </Tooltip>
          </ButtonGroup>

          <Typography variant="caption" color="text.secondary">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </Typography>
        </Stack>
      </Box>

      {/* Canvas Timeline */}
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        sx={{
          flex: 1,
          position: 'relative',
          cursor: isDraggingPlayhead
            ? 'grabbing'
            : isDraggingTrack
            ? 'grabbing'
            : isPanning
            ? 'grabbing'
            : 'default',
          overflow: 'hidden',
          userSelect: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: tracks.length * TRACK_HEIGHT
          }}
        />

        {/* Instructions overlay */}
        {!isDraggingTrack && !isDraggingPlayhead && !isPanning && (
          <Box sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'rgba(255, 255, 255, 0.6)',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            pointerEvents: 'none'
          }}>
            <Typography variant="caption">
              Drag tracks to reposition • Scroll to pan • Ctrl+Scroll to zoom
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default TrackTimeline;
