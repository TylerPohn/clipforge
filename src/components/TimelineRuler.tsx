import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { useVideoStore } from '../store/videoStore';

function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<{ type: 'clip-start' | 'clip-end' | 'playhead'; clipId?: string } | null>(null);

  const {
    clips,
    videoDuration,
    currentTime,
    setCurrentTime,
    updateClipTrim
  } = useVideoStore();

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    // Draw background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, width, height);

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
      ctx.fillRect(clipStartX, 0, clipWidth, height);

      // Draw trim handles for this clip (yellow/gold color)
      ctx.fillStyle = '#ffd700';

      // Left trim handle
      ctx.fillRect(clipStartX - 2, 0, 4, height);

      // Right trim handle
      ctx.fillRect(clipEndX - 2, 0, 4, height);

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

    // Calculate playhead position
    const playheadX = (currentTime / videoDuration) * width;

    // Draw playhead (pink/red line) - on top of everything
    ctx.fillStyle = '#ff4081';
    ctx.fillRect(playheadX - 1, 0, 2, height);

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

  }, [clips, videoDuration, currentTime, formatTime]);

  // Handle mouse down (start dragging or seeking)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = (x / rect.width) * videoDuration;

    // Determine what user clicked on (threshold = 10 pixels)
    const threshold = 10;
    const clipGap = 4; // Must match the gap in the drawing code

    // Find the closest clip handle (if any)
    let closestHandle: { type: 'clip-start' | 'clip-end'; clipId: string; distance: number } | null = null;

    for (let index = 0; index < clips.length; index++) {
      const clip = clips[index];
      if (!clip.duration) continue;

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

    const playheadX = (currentTime / videoDuration) * rect.width;

    // Check if clicking on playhead (only if we didn't hit a clip handle)
    if (Math.abs(x - playheadX) < threshold) {
      setIsDragging({ type: 'playhead' });
      return;
    }

    // Click on timeline = seek
    setCurrentTime(timeAtX);
  };

  // Handle mouse move (dragging)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = Math.max(0, Math.min(videoDuration, (x / rect.width) * videoDuration));

    if (isDragging.type === 'playhead') {
      setCurrentTime(timeAtX);
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
  };

  // Handle mouse up (stop dragging)
  const handleMouseUp = () => {
    setIsDragging(null);
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
        <Typography variant="caption" color="text.secondary">
          Total Duration: {formatTime(videoDuration)}
        </Typography>
      </Stack>

      {/* Canvas Timeline */}
      <Box
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        sx={{
          position: 'relative',
          height: 80,
          cursor: isDragging ? 'grabbing' : 'pointer',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: 'rgba(0, 0, 0, 0.2)'
        }}
      >
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || 800}
          height={80}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </Box>
    </Box>
  );
}

export default TimelineRuler;
