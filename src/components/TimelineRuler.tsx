import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Stack, IconButton } from '@mui/material';
import { ContentCut } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

function TimelineRuler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null);

  const {
    videoDuration,
    currentTime,
    trimStart,
    trimEnd,
    setCurrentTime,
    setTrimPoints
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
    if (!canvas || !videoDuration) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate pixel positions
    const trimStartX = (trimStart / videoDuration) * width;
    const trimEndX = (trimEnd / videoDuration) * width;
    const playheadX = (currentTime / videoDuration) * width;

    // Draw background (non-trimmed regions) - slightly visible
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, 0, width, height);

    // Draw trimmed region (highlighted in cyan)
    ctx.fillStyle = 'rgba(0, 188, 212, 0.2)';
    ctx.fillRect(trimStartX, 0, trimEndX - trimStartX, height);

    // Draw trim start handle (left side)
    ctx.fillStyle = '#00bcd4';
    ctx.fillRect(trimStartX - 2, 0, 4, height);

    // Draw trim end handle (right side)
    ctx.fillStyle = '#00bcd4';
    ctx.fillRect(trimEndX - 2, 0, 4, height);

    // Draw playhead (pink/red line)
    ctx.fillStyle = '#ff4081';
    ctx.fillRect(playheadX - 1, 0, 2, height);

    // Draw time markers with labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';
    ctx.textBaseline = 'bottom';

    const markerInterval = Math.ceil(videoDuration / 10); // ~10 markers across timeline
    for (let i = 0; i <= videoDuration; i += markerInterval) {
      const x = (i / videoDuration) * width;
      // Draw marker tick
      ctx.fillRect(x, height - 10, 1, 10);
      // Draw time label
      ctx.fillText(formatTime(i), x + 2, height - 12);
    }

  }, [videoDuration, trimStart, trimEnd, currentTime]);

  // Handle mouse down (start dragging or seeking)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = (x / rect.width) * videoDuration;

    // Determine what user clicked on (threshold = 10 pixels)
    const threshold = 10;

    const trimStartX = (trimStart / videoDuration) * rect.width;
    const trimEndX = (trimEnd / videoDuration) * rect.width;
    const playheadX = (currentTime / videoDuration) * rect.width;

    if (Math.abs(x - trimStartX) < threshold) {
      setIsDragging('start');
    } else if (Math.abs(x - trimEndX) < threshold) {
      setIsDragging('end');
    } else if (Math.abs(x - playheadX) < threshold) {
      setIsDragging('playhead');
    } else {
      // Click on timeline = seek
      setCurrentTime(timeAtX);
    }
  };

  // Handle mouse move (dragging)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !videoDuration || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeAtX = Math.max(0, Math.min(videoDuration, (x / rect.width) * videoDuration));

    if (isDragging === 'start') {
      setTrimPoints(Math.min(timeAtX, trimEnd - 0.5), trimEnd);
    } else if (isDragging === 'end') {
      setTrimPoints(trimStart, Math.max(timeAtX, trimStart + 0.5));
    } else if (isDragging === 'playhead') {
      setCurrentTime(timeAtX);
    }
  };

  // Handle mouse up (stop dragging)
  const handleMouseUp = () => {
    setIsDragging(null);
  };

  // Reset trim to full video
  const resetTrim = () => {
    if (videoDuration) {
      setTrimPoints(0, videoDuration);
    }
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
      {/* Header with title and trim info */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Timeline
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {formatTime(trimStart)} → {formatTime(trimEnd)} ({formatTime(trimEnd - trimStart)})
          </Typography>
          <IconButton
            size="small"
            onClick={resetTrim}
            title="Reset trim to full video"
            sx={{ p: 0.5 }}
          >
            <ContentCut fontSize="small" />
          </IconButton>
        </Stack>
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
