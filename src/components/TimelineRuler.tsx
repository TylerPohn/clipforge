import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Stack, IconButton, Tooltip, CircularProgress } from '@mui/material';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DeleteIcon from '@mui/icons-material/Delete';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditIcon from '@mui/icons-material/Edit';
import { useVideoStore } from '../store/videoStore';
import { pixelToTime, formatTimeWithMillis } from '../utils/timelineHelpers';

interface DragOverState {
  zone: 'main' | 'pip' | null;
  time: number;
  x: number;
  y: number;
}

function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<{ type: 'clip-start' | 'clip-end' | 'playhead' | 'clip-reorder' | 'pip-move'; clipId?: string; originalIndex?: number; dragX?: number; offsetX?: number } | null>(null);
  const [dragOverState, setDragOverState] = useState<DragOverState | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [hoveredClipPosition, setHoveredClipPosition] = useState<{ left: number; width: number } | null>(null);
  const [trimModeClipId, setTrimModeClipId] = useState<string | null>(null);

  const {
    clips,
    pipTrack,
    videoDuration,
    currentTime,
    setCurrentTime,
    updateClipTrim,
    splitClipAtTime,
    getCurrentClip,
    isSplitting,
    insertClipAtTime,
    setPipTrackFromClip,
    reorderClip,
    updatePipTrackOffset,
    removeClip
  } = useVideoStore();

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if split is available at current playhead position
  const canSplitAtPlayhead = () => {
    const currentClip = getCurrentClip();
    if (!currentClip || !currentClip.duration) return false;

    const timeInClip = currentTime - currentClip.startTimeInSequence;
    const trimmedDuration = currentClip.trimEnd - currentClip.trimStart;
    const minDuration = 0.1;

    // Check if playhead is at least 0.1s from both edges
    return timeInClip >= minDuration && timeInClip <= trimmedDuration - minDuration;
  };

  // Handle split button click
  const handleSplitClip = () => {
    const currentClip = getCurrentClip();
    if (!currentClip || !canSplitAtPlayhead()) return;

    splitClipAtTime(currentClip.id, currentTime);
  };

  // Draw timeline on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoDuration || clips.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Define heights for main track and PiP track
    const mainTrackHeight = pipTrack ? height * 0.65 : height;
    const pipTrackTop = pipTrack ? mainTrackHeight + 5 : 0;
    const pipTrackHeight = pipTrack ? height - pipTrackTop : 0;

    // Draw background for main track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, width, mainTrackHeight);

    // Draw background for PiP track if it exists
    if (pipTrack) {
      ctx.fillStyle = 'rgba(156, 39, 176, 0.1)'; // Purple tint for PiP track
      ctx.fillRect(0, pipTrackTop, width, pipTrackHeight);

      // Draw PiP track label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('PiP', 4, pipTrackTop + 2);
    }

    // Draw each clip showing only trimmed portion with trim handles
    const clipGap = 4; // Pixels of space between clips

    clips.forEach((clip, index) => {
      if (!clip.duration) return;

      // Calculate trimmed duration
      const trimmedDuration = clip.trimEnd - clip.trimStart;
      const clipStartX = (clip.startTimeInSequence / videoDuration) * width + (index > 0 ? clipGap / 2 : 0);
      const clipEndX = ((clip.startTimeInSequence + trimmedDuration) / videoDuration) * width - (index < clips.length - 1 ? clipGap / 2 : 0);
      const clipWidth = clipEndX - clipStartX;

      // Alternate colors for visual distinction
      const colors = [
        'rgba(0, 188, 212, 0.3)', // Cyan
        'rgba(156, 39, 176, 0.3)', // Purple
        'rgba(255, 152, 0, 0.3)',  // Orange
        'rgba(76, 175, 80, 0.3)',  // Green
      ];
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(clipStartX, 0, clipWidth, mainTrackHeight);

      // Draw trim handles ONLY if this clip is in trim mode (yellow/gold color)
      if (trimModeClipId === clip.id) {
        ctx.fillStyle = '#ffd700';

        // Left trim handle
        ctx.fillRect(clipStartX - 2, 0, 4, mainTrackHeight);

        // Right trim handle
        ctx.fillRect(clipEndX - 2, 0, 4, mainTrackHeight);
      }

      // Draw clip name (if space permits)
      if (clipWidth > 60) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '11px sans-serif';
        ctx.textBaseline = 'top';
        const clipName = clip.name.length > 15 ? clip.name.substring(0, 12) + '...' : clip.name;
        ctx.fillText(clipName, clipStartX + 4, 4);

        // Show trimmed duration
        ctx.font = '9px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillText(formatTime(trimmedDuration), clipStartX + 4, 18);
      }
    });

    // Draw PiP track if it exists
    if (pipTrack) {
      const pipStartTime = pipTrack.offset / 1000; // Convert from ms to seconds
      const pipDuration = pipTrack.duration / 1000;
      const pipStartX = (pipStartTime / videoDuration) * width;
      const pipEndX = ((pipStartTime + pipDuration) / videoDuration) * width;
      const pipWidth = pipEndX - pipStartX;

      // Draw PiP track bar
      ctx.fillStyle = 'rgba(156, 39, 176, 0.6)'; // Purple
      ctx.fillRect(pipStartX, pipTrackTop, pipWidth, pipTrackHeight);

      // Draw PiP track border
      ctx.strokeStyle = '#9c27b0';
      ctx.lineWidth = 2;
      ctx.strokeRect(pipStartX, pipTrackTop, pipWidth, pipTrackHeight);

      // Draw PiP track name (if space permits)
      if (pipWidth > 60) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textBaseline = 'middle';
        const pipName = pipTrack.name.length > 12 ? pipTrack.name.substring(0, 9) + '...' : pipTrack.name;
        ctx.fillText(pipName, pipStartX + 4, pipTrackTop + pipTrackHeight / 2);
      }
    }

    // Draw time markers with labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';

    const markerInterval = Math.max(1, Math.ceil(videoDuration / 10)); // ~10 markers across timeline
    for (let i = 0; i <= videoDuration; i += markerInterval) {
      const x = (i / videoDuration) * width;
      // Draw marker tick
      ctx.fillRect(x, height - 10, 1, 10);
      // Draw time label
      ctx.fillText(formatTime(i), x + 2, height - 12);
    }

    // Draw drag preview line when dragging over timeline
    if (dragOverState) {
      const previewX = (dragOverState.time / videoDuration) * width;

      // Draw preview line with different color based on zone
      if (dragOverState.zone === 'main') {
        ctx.strokeStyle = 'rgba(0, 188, 212, 0.8)'; // Cyan for main track
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(previewX, 0);
        ctx.lineTo(previewX, mainTrackHeight);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash
      } else if (dragOverState.zone === 'pip') {
        ctx.strokeStyle = 'rgba(156, 39, 176, 0.8)'; // Purple for PiP track
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(previewX, pipTrackTop);
        ctx.lineTo(previewX, height);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash
      }
    }

    // Draw clip reorder preview
    if (isDragging?.type === 'clip-reorder' && isDragging.dragX !== undefined && isDragging.clipId && isDragging.offsetX !== undefined) {
      const draggedClip = clips.find(c => c.id === isDragging.clipId);
      if (draggedClip && draggedClip.duration) {
        const trimmedDuration = draggedClip.trimEnd - draggedClip.trimStart;
        const clipWidth = (trimmedDuration / videoDuration) * width;

        // Calculate preview position: current mouse position minus the offset from clip start
        // This makes the preview match the actual clip boundaries
        const previewStartX = isDragging.dragX - isDragging.offsetX;

        // Draw semi-transparent preview at drag position
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(previewStartX, 0, clipWidth, mainTrackHeight);

        // Draw border
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.strokeRect(previewStartX, 0, clipWidth, mainTrackHeight);
      }
    }

    // Draw PiP move preview
    if (isDragging?.type === 'pip-move' && isDragging.dragX !== undefined && isDragging.offsetX !== undefined && pipTrack) {
      const pipDuration = pipTrack.duration / 1000;
      const pipWidth = (pipDuration / videoDuration) * width;

      // Calculate preview position: current mouse position minus the offset from track start
      // This makes the preview match the actual track boundaries
      const previewStartX = isDragging.dragX - isDragging.offsetX;

      // Draw semi-transparent preview at drag position
      ctx.fillStyle = 'rgba(156, 39, 176, 0.5)';
      ctx.fillRect(previewStartX, pipTrackTop, pipWidth, pipTrackHeight);

      // Draw border
      ctx.strokeStyle = '#9c27b0';
      ctx.lineWidth = 2;
      ctx.strokeRect(previewStartX, pipTrackTop, pipWidth, pipTrackHeight);
    }

    // Draw playhead LAST - should be on top of everything (highest z-index on canvas)
    const playheadX = (currentTime / videoDuration) * width;
    ctx.fillStyle = '#ff4081';
    ctx.fillRect(playheadX - 1, 0, 2, height);

  }, [clips, pipTrack, videoDuration, currentTime, formatTime, dragOverState, isDragging, trimModeClipId]);

  // Handle mouse down (start dragging or seeking)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = (x / rect.width) * videoDuration;

    // Determine what user clicked on (threshold = 10 pixels)
    const threshold = 10;
    const clipGap = 4; // Must match the gap in the drawing code

    // Find the closest clip handle (if any) - ONLY if that clip is in trim mode
    let closestHandle: { type: 'clip-start' | 'clip-end'; clipId: string; distance: number } | null = null;

    if (trimModeClipId) {
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index];
        if (!clip.duration || clip.id !== trimModeClipId) continue;

        const trimmedDuration = clip.trimEnd - clip.trimStart;
        const clipStartX = (clip.startTimeInSequence / videoDuration) * rect.width + (index > 0 ? clipGap / 2 : 0);
        const clipEndX = ((clip.startTimeInSequence + trimmedDuration) / videoDuration) * rect.width - (index < clips.length - 1 ? clipGap / 2 : 0);

        const startDistance = Math.abs(x - clipStartX);
        const endDistance = Math.abs(x - clipEndX);

        if (startDistance < threshold) {
          if (!closestHandle || startDistance < closestHandle.distance) {
            closestHandle = { type: 'clip-start', clipId: clip.id, distance: startDistance };
          }
        }

        if (endDistance < threshold) {
          if (!closestHandle || endDistance < closestHandle.distance) {
            closestHandle = { type: 'clip-end', clipId: clip.id, distance: endDistance };
          }
        }
      }

      // If we found a clip handle, use it
      if (closestHandle) {
        setIsDragging({ type: closestHandle.type, clipId: closestHandle.clipId });
        return;
      }
    }

    // Check playhead FIRST (before clip bodies) - playhead has priority
    const playheadX = (currentTime / videoDuration) * rect.width;
    const playheadThreshold = 15; // Slightly larger threshold for easier grabbing

    if (Math.abs(x - playheadX) < playheadThreshold) {
      setIsDragging({ type: 'playhead' });
      return;
    }

    const y = e.clientY - rect.top;
    const mainTrackHeight = pipTrack ? 80 * 0.65 : 80;
    const pipTrackTop = pipTrack ? mainTrackHeight + 5 : 0;

    // Check if clicking on PiP track (if it exists)
    if (pipTrack && y >= pipTrackTop) {
      const pipStartTime = pipTrack.offset / 1000;
      const pipDuration = pipTrack.duration / 1000;
      const pipStartX = (pipStartTime / videoDuration) * rect.width;
      const pipEndX = ((pipStartTime + pipDuration) / videoDuration) * rect.width;

      // Check if click is within PiP track bounds
      if (x >= pipStartX && x <= pipEndX) {
        console.log('[TimelineRuler] Starting PiP drag');
        // Store the offset from the PiP track start so preview matches actual track boundaries
        const offsetX = x - pipStartX;
        setIsDragging({ type: 'pip-move', dragX: x, offsetX });
        return;
      }
    }

    // Check if clicking inside a clip body (for reordering) - AFTER playhead check
    if (y < mainTrackHeight) {
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index];
        if (!clip.duration) continue;

        const trimmedDuration = clip.trimEnd - clip.trimStart;
        const clipStartX = (clip.startTimeInSequence / videoDuration) * rect.width + (index > 0 ? clipGap / 2 : 0);
        const clipEndX = ((clip.startTimeInSequence + trimmedDuration) / videoDuration) * rect.width - (index < clips.length - 1 ? clipGap / 2 : 0);

        // Check if click is inside the clip (away from edges)
        if (x > clipStartX + threshold && x < clipEndX - threshold) {
          console.log('[TimelineRuler] Starting clip reorder drag:', clip.name);
          // Store the offset from the clip start so preview matches actual clip boundaries
          const offsetX = x - clipStartX;
          setIsDragging({ type: 'clip-reorder', clipId: clip.id, originalIndex: index, dragX: x, offsetX });
          return;
        }
      }
    }

    // Click on timeline = seek
    setCurrentTime(timeAtX);
  };

  // Handle mouse move (dragging and hover detection)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const timeAtX = Math.max(0, Math.min(videoDuration, (x / rect.width) * videoDuration));

    // Handle dragging
    if (isDragging) {
      if (isDragging.type === 'playhead') {
        setCurrentTime(timeAtX);
      } else if (isDragging.type === 'clip-reorder') {
        // Update drag position for visual feedback
        setIsDragging({ ...isDragging, dragX: x });
      } else if (isDragging.type === 'pip-move') {
        // Update drag position for visual feedback
        setIsDragging({ ...isDragging, dragX: x });
      } else if ((isDragging.type === 'clip-start' || isDragging.type === 'clip-end') && isDragging.clipId) {
        const clip = clips.find(c => c.id === isDragging.clipId);
        if (!clip || !clip.duration) return;

        // Convert timeline time to time within the clip's original duration
        const relativeTime = timeAtX - clip.startTimeInSequence;

        // Calculate where in the original clip this corresponds to
        // We need to account for the current trim offset
        if (isDragging.type === 'clip-start') {
          // Dragging the start handle - adjust trimStart
          // The new trimStart should be the current trimStart plus/minus the delta
          const currentTrimmedStart = 0; // Start of visible portion in sequence
          const delta = relativeTime - currentTrimmedStart;
          const newTrimStart = Math.max(0, Math.min(clip.trimStart + delta, clip.trimEnd - 0.1));

          updateClipTrim(clip.id, newTrimStart, clip.trimEnd);
        } else {
          // Dragging the end handle - adjust trimEnd
          const newTrimmedDuration = Math.max(0.1, relativeTime);
          const newTrimEnd = Math.min(clip.duration, clip.trimStart + newTrimmedDuration);

          updateClipTrim(clip.id, clip.trimStart, newTrimEnd);
        }
      }
      return;
    }

    // Handle hover detection (only when not dragging)
    const mainTrackHeight = pipTrack ? 80 * 0.65 : 80;
    const clipGap = 4;

    // Check if hovering over a clip in the main track
    if (y < mainTrackHeight) {
      let foundClip = false;
      for (let index = 0; index < clips.length; index++) {
        const clip = clips[index];
        if (!clip.duration) continue;

        const trimmedDuration = clip.trimEnd - clip.trimStart;
        const clipStartX = (clip.startTimeInSequence / videoDuration) * rect.width + (index > 0 ? clipGap / 2 : 0);
        const clipEndX = ((clip.startTimeInSequence + trimmedDuration) / videoDuration) * rect.width - (index < clips.length - 1 ? clipGap / 2 : 0);

        if (x >= clipStartX && x <= clipEndX) {
          setHoveredClipId(clip.id);
          setHoveredClipPosition({ left: clipStartX, width: clipEndX - clipStartX });
          foundClip = true;
          break;
        }
      }

      if (!foundClip) {
        setHoveredClipId(null);
        setHoveredClipPosition(null);
      }
    } else {
      setHoveredClipId(null);
      setHoveredClipPosition(null);
    }
  };

  // Handle mouse leave (clear hover state and stop dragging)
  const handleMouseLeaveTimeline = () => {
    setHoveredClipId(null);
    setHoveredClipPosition(null);
    if (isDragging) {
      handleMouseUp();
    }
  };

  // Handle mouse up (stop dragging)
  const handleMouseUp = () => {
    if (!isDragging || !containerRef.current || !videoDuration) {
      setIsDragging(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();

    // Handle clip reorder completion
    if (isDragging.type === 'clip-reorder' && isDragging.clipId && isDragging.dragX !== undefined && isDragging.originalIndex !== undefined) {
      const x = isDragging.dragX;
      const timeAtX = (x / rect.width) * videoDuration;

      // Find which clip position this corresponds to
      let newIndex = isDragging.originalIndex;
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        if (!clip.duration) continue;

        const clipMidTime = clip.startTimeInSequence + (clip.trimEnd - clip.trimStart) / 2;
        if (timeAtX < clipMidTime) {
          newIndex = i;
          break;
        }
        if (i === clips.length - 1) {
          newIndex = clips.length - 1;
        }
      }

      if (newIndex !== isDragging.originalIndex) {
        console.log('[TimelineRuler] Reordering clip from', isDragging.originalIndex, 'to', newIndex);
        reorderClip(isDragging.clipId, newIndex);
      }
    }

    // Handle PiP move completion
    if (isDragging.type === 'pip-move' && pipTrack && isDragging.dragX !== undefined && isDragging.offsetX !== undefined) {
      // Calculate the new start position: current mouse position minus the offset
      const previewStartX = isDragging.dragX - isDragging.offsetX;
      const newOffsetSeconds = (previewStartX / rect.width) * videoDuration;
      const newOffsetMs = Math.max(0, Math.min(videoDuration * 1000, newOffsetSeconds * 1000));

      console.log('[TimelineRuler] Moving PiP track to offset:', newOffsetMs);
      updatePipTrackOffset(newOffsetMs);
    }

    setIsDragging(null);
  };

  // Drag-and-drop handlers for clips from MediaPanel
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    if (!containerRef.current || !videoDuration) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate time from pixel position
    const time = pixelToTime(x, rect.width, videoDuration);

    // Determine which zone we're over (main track or PiP track)
    const mainTrackHeight = pipTrack ? 80 * 0.65 : 80;
    const zone: 'main' | 'pip' = y < mainTrackHeight ? 'main' : 'pip';

    setDragOverState({ zone, time, x, y });
  };

  const handleDragLeave = () => {
    setDragOverState(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    if (!dragOverState || !videoDuration) {
      setDragOverState(null);
      return;
    }

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { clipId, clipData } = data;

      // Validate clip exists
      if (!clipId || !clipData) {
        console.error('[TimelineRuler] Invalid drop data');
        setDragOverState(null);
        return;
      }

      // Validate clip has required metadata
      const clip = clips.find(c => c.id === clipId);
      if (!clip) {
        console.error('[TimelineRuler] Clip not found:', clipId);
        setDragOverState(null);
        return;
      }

      if (!clip.duration || !clip.resolution) {
        console.error('[TimelineRuler] Clip metadata not loaded:', clipId);
        setDragOverState(null);
        return;
      }

      // Validate drop time is within bounds
      if (dragOverState.time < 0 || dragOverState.time > videoDuration) {
        console.warn('[TimelineRuler] Drop time out of bounds:', dragOverState.time);
        setDragOverState(null);
        return;
      }

      console.log('[TimelineRuler] Drop event:', {
        clipId,
        zone: dragOverState.zone,
        time: dragOverState.time
      });

      if (dragOverState.zone === 'main') {
        // Add clip to main timeline at the calculated time
        insertClipAtTime(clipId, dragOverState.time);
      } else if (dragOverState.zone === 'pip') {
        // Set as PiP track with calculated offset (auto-replaces existing)
        setPipTrackFromClip(clipId, dragOverState.time);
        console.log('[TimelineRuler] PiP track set from clip:', clipId, 'at offset:', dragOverState.time);
      }
    } catch (error) {
      console.error('[TimelineRuler] Failed to parse drag data:', error);
    }

    setDragOverState(null);
  };

  if (!videoDuration) {
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
          Timeline will appear here
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: 140,
      backgroundColor: 'background.paper',
      borderTop: '1px solid rgba(255, 255, 255, 0.12)',
      p: 2
    }}>
      {/* Header with title and duration info */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Timeline
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title="Reset playhead to start" placement="top">
            <IconButton
              onClick={() => setCurrentTime(0)}
              size="small"
              sx={{
                opacity: currentTime > 0 ? 0.7 : 0.3,
                transition: 'opacity 0.2s',
                '&:hover': {
                  opacity: 1,
                }
              }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            Total Duration: {formatTime(videoDuration)}
          </Typography>
        </Stack>
      </Stack>

      {/* Canvas Timeline */}
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeaveTimeline}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          position: 'relative',
          height: 80,
          cursor: isDragging ? 'grabbing' : 'pointer',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 1,
          overflow: 'visible',
          backgroundColor: dragOverState
            ? dragOverState.zone === 'main'
              ? 'rgba(0, 188, 212, 0.1)'
              : 'rgba(156, 39, 176, 0.1)'
            : 'rgba(0, 0, 0, 0.2)',
          transition: 'background-color 0.1s ease'
        }}
      >
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || 800}
          height={80}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Split button - appears near playhead when valid split position */}
        {canSplitAtPlayhead() && containerRef.current && (
          <Tooltip title={isSplitting ? "Splitting..." : "Split clip at playhead"} placement="top">
            <IconButton
              onClick={handleSplitClip}
              disabled={isSplitting}
              size="small"
              sx={{
                position: 'absolute',
                left: `${(currentTime / (videoDuration || 1)) * 100}%`,
                top: -40,
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(255, 64, 129, 0.9)',
                color: 'white',
                opacity: isSplitting ? 1 : 0.5,
                transition: 'opacity 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: 'rgba(255, 64, 129, 1)',
                  opacity: 1,
                },
                '&.Mui-disabled': {
                  backgroundColor: 'rgba(255, 64, 129, 0.9)',
                  color: 'white',
                  opacity: 1,
                },
                boxShadow: 2,
                width: 32,
                height: 32,
                zIndex: 10
              }}
            >
              {isSplitting ? (
                <CircularProgress size={16} sx={{ color: 'white' }} />
              ) : (
                <ContentCutIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        )}

        {/* Drag time tooltip */}
        {dragOverState && containerRef.current && (
          <Box
            sx={{
              position: 'absolute',
              left: `${(dragOverState.time / (videoDuration || 1)) * 100}%`,
              top: -30,
              transform: 'translateX(-50%)',
              backgroundColor: dragOverState.zone === 'main'
                ? 'rgba(0, 188, 212, 0.95)'
                : 'rgba(156, 39, 176, 0.95)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: 1,
              fontSize: '11px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100,
              boxShadow: 2
            }}
          >
            <Box component="span" sx={{ display: 'block' }}>
              {formatTimeWithMillis(dragOverState.time)}
            </Box>
            <Box component="span" sx={{ display: 'block', fontSize: '9px', opacity: 0.9 }}>
              {dragOverState.zone === 'main' ? 'Main Track' : 'PiP Track'}
            </Box>
          </Box>
        )}

        {/* Trim/Edit button for hovered clip */}
        {hoveredClipId && hoveredClipPosition && containerRef.current && (
          <Tooltip title={trimModeClipId === hoveredClipId ? "Exit trim mode" : "Enable trim mode"} placement="top">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                if (trimModeClipId === hoveredClipId) {
                  setTrimModeClipId(null);
                } else {
                  setTrimModeClipId(hoveredClipId);
                }
              }}
              size="small"
              sx={{
                position: 'absolute',
                left: hoveredClipPosition.left + hoveredClipPosition.width - 48,
                top: 4,
                backgroundColor: trimModeClipId === hoveredClipId
                  ? 'rgba(255, 193, 7, 0.9)'  // Gold when active
                  : 'rgba(33, 150, 243, 0.9)', // Blue when inactive
                color: 'white',
                opacity: 0.8,
                transition: 'opacity 0.2s ease-in-out, background-color 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: trimModeClipId === hoveredClipId
                    ? 'rgba(255, 193, 7, 1)'
                    : 'rgba(33, 150, 243, 1)',
                  opacity: 1,
                },
                boxShadow: 1,
                width: 24,
                height: 24,
                zIndex: 20
              }}
            >
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Delete button for hovered clip */}
        {hoveredClipId && hoveredClipPosition && containerRef.current && (
          <Tooltip title="Delete clip from timeline" placement="top">
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                removeClip(hoveredClipId);
                setHoveredClipId(null);
                setHoveredClipPosition(null);
                // Clear trim mode if deleting the clip that's in trim mode
                if (trimModeClipId === hoveredClipId) {
                  setTrimModeClipId(null);
                }
              }}
              size="small"
              sx={{
                position: 'absolute',
                left: hoveredClipPosition.left + hoveredClipPosition.width - 20,
                top: 4,
                backgroundColor: 'rgba(244, 67, 54, 0.9)',
                color: 'white',
                opacity: 0.8,
                transition: 'opacity 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: 'rgba(244, 67, 54, 1)',
                  opacity: 1,
                },
                boxShadow: 1,
                width: 24,
                height: 24,
                zIndex: 20
              }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export default TimelineRuler;
