import { Box, Typography, Paper, IconButton, Stack, Chip } from '@mui/material';
import { Delete, ArrowBack, ArrowForward, RestartAlt, PictureInPictureAlt, AddCircleOutline } from '@mui/icons-material';
import { useVideoStore, Clip } from '../store/videoStore';
import { useVideoThumbnail } from '../hooks/useVideoThumbnail';
import { useRef, useState } from 'react';

interface ClipCardProps {
  clip: Clip;
  index: number;
  totalClips: number;
  isActive: boolean;
  isPipTrack: boolean;
  onRemove: (id: string) => void;
  onReorder: (clipId: string, newIndex: number) => void;
  onReset: (id: string) => void;
  onSetPip: (clipId: string) => void;
  onRemovePip: () => void;
  onAddToTimeline: (clipId: string) => void;
  isLibraryClip: boolean; // True if clip is in library (not timeline)
}

function ClipCard({ clip, index, totalClips, isActive, isPipTrack, onRemove, onReorder, onReset, onSetPip, onRemovePip, onAddToTimeline, isLibraryClip }: ClipCardProps) {
  console.log('[MediaPanel] ClipCard rendering for clip:', { id: clip.id, name: clip.name, path: clip.path, hasPath: !!clip.path });
  // Use trimStart as the thumbnail seek time so split clips get unique thumbnails
  const thumbnailUrl = useVideoThumbnail(clip.path, clip.trimStart);
  console.log('[MediaPanel] Thumbnail URL for clip', clip.name, ':', thumbnailUrl ? 'Generated' : 'null', 'seekTime:', clip.trimStart);

  const [isDragging, setIsDragging] = useState(false);
  const thumbnailRef = useRef<HTMLImageElement>(null);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return 'Loading...';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if clip is trimmed
  const isTrimmed = clip.duration !== null && (clip.trimStart > 0 || clip.trimEnd < clip.duration);
  const trimmedDuration = clip.duration !== null ? clip.trimEnd - clip.trimStart : null;

  const handleMoveBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (index > 0) {
      onReorder(clip.id, index - 1);
    }
  };

  const handleMoveForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (index < totalClips - 1) {
      onReorder(clip.id, index + 1);
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReset(clip.id);
  };

  const handleTogglePip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPipTrack) {
      onRemovePip();
    } else {
      onSetPip(clip.id);
    }
  };

  const handleAddToTimeline = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToTimeline(clip.id);
  };

  // Drag handlers for timeline drag-and-drop
  const handleDragStart = (e: React.DragEvent) => {
    console.log('[ClipCard] Drag started for clip:', clip.id);
    setIsDragging(true);

    // Set the clip data in the drag event
    e.dataTransfer.effectAllowed = 'copy'; // Clips stay in Media panel
    e.dataTransfer.setData('application/json', JSON.stringify({
      clipId: clip.id,
      clipData: clip
    }));

    // Create custom drag image from thumbnail if available
    if (thumbnailRef.current) {
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-1000px';
      dragPreview.style.width = '160px';
      dragPreview.style.padding = '8px';
      dragPreview.style.backgroundColor = 'rgba(30, 30, 30, 0.95)';
      dragPreview.style.borderRadius = '8px';
      dragPreview.style.border = '2px solid #00bcd4';
      dragPreview.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';

      // Add thumbnail
      const img = document.createElement('img');
      img.src = thumbnailUrl || '';
      img.style.width = '100%';
      img.style.height = '90px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '4px';
      img.style.marginBottom = '4px';
      dragPreview.appendChild(img);

      // Add clip name
      const name = document.createElement('div');
      name.textContent = clip.name;
      name.style.color = 'white';
      name.style.fontSize = '11px';
      name.style.fontWeight = 'bold';
      name.style.textAlign = 'center';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      name.style.whiteSpace = 'nowrap';
      dragPreview.appendChild(name);

      document.body.appendChild(dragPreview);
      e.dataTransfer.setDragImage(dragPreview, 80, 60);

      // Clean up the preview element after drag starts
      setTimeout(() => {
        document.body.removeChild(dragPreview);
      }, 0);
    }
  };

  const handleDragEnd = () => {
    console.log('[ClipCard] Drag ended for clip:', clip.id);
    setIsDragging(false);
  };

  return (
    <Paper
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      elevation={isActive ? 8 : 2}
      sx={{
        minWidth: 160,
        width: 160,
        height: 120,
        position: 'relative',
        transition: 'all 0.2s',
        border: isPipTrack ? '2px solid #9c27b0' : isActive ? '2px solid #00bcd4' : '2px solid transparent',
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover': {
          elevation: 4,
          borderColor: isPipTrack ? '#9c27b0' : isActive ? '#00bcd4' : 'rgba(255, 255, 255, 0.2)',
        },
        userSelect: 'none' // Prevent text selection
      }}
    >
      {/* Reorder arrows */}
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          position: 'absolute',
          top: 4,
          left: 4,
          zIndex: 10,
        }}
      >
        <IconButton
          size="small"
          onClick={handleMoveBack}
          disabled={index === 0}
          sx={{
            p: 0.25,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={handleMoveForward}
          disabled={index === totalClips - 1}
          sx={{
            p: 0.25,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.8)' },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              color: 'rgba(255, 255, 255, 0.3)'
            }
          }}
        >
          <ArrowForward fontSize="small" />
        </IconButton>
      </Stack>

      {/* Clip number badge or PiP indicator */}
      {isPipTrack ? (
        <Chip
          label="PiP"
          size="small"
          icon={<PictureInPictureAlt />}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            height: 20,
            fontSize: '0.7rem',
            zIndex: 10,
            fontWeight: 'bold'
          }}
          color="secondary"
        />
      ) : (
        <Chip
          label={`#${index + 1}`}
          size="small"
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            height: 20,
            fontSize: '0.7rem',
            zIndex: 10,
            fontWeight: 'bold'
          }}
          color={isActive ? 'primary' : 'default'}
        />
      )}

      {/* Video thumbnail */}
      <Box sx={{
        width: '100%',
        height: '70%',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px 4px 0 0',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {thumbnailUrl ? (
          <>
            <Box
              component="img"
              ref={thumbnailRef}
              src={thumbnailUrl}
              alt={clip.name}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            {/* Resolution overlay */}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 'bold'
              }}
            >
              {clip.resolution
                ? `${clip.resolution.width}x${clip.resolution.height}`
                : 'Loading...'}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {clip.resolution
              ? `${clip.resolution.width}x${clip.resolution.height}`
              : 'Loading...'}
          </Typography>
        )}
      </Box>

      {/* Clip info */}
      <Box sx={{ p: 1 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
          <Typography
            variant="caption"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              fontSize: '0.7rem'
            }}
            title={clip.name}
          >
            {clip.name}
          </Typography>
          <Stack direction="row" spacing={0.25}>
            {/* Add to Timeline button - only show for library clips */}
            {isLibraryClip && (
              <IconButton
                size="small"
                onClick={handleAddToTimeline}
                title="Add to main timeline"
                sx={{
                  p: 0.25,
                  opacity: 0.8,
                  color: 'primary.main',
                  '&:hover': { opacity: 1, backgroundColor: 'rgba(0, 188, 212, 0.1)' }
                }}
              >
                <AddCircleOutline fontSize="small" />
              </IconButton>
            )}
            {/* PiP button */}
            <IconButton
              size="small"
              onClick={handleTogglePip}
              title={isPipTrack ? "Remove from PiP" : "Set as PiP track"}
              sx={{
                p: 0.25,
                opacity: isPipTrack ? 1 : 0.6,
                color: isPipTrack ? 'secondary.main' : 'inherit',
                '&:hover': { opacity: 1, color: 'secondary.main' }
              }}
            >
              <PictureInPictureAlt fontSize="small" />
            </IconButton>
            {/* Reset button - only show if clip is trimmed */}
            {isTrimmed && (
              <IconButton
                size="small"
                onClick={handleReset}
                title="Reset to original duration"
                sx={{
                  p: 0.25,
                  opacity: 0.6,
                  '&:hover': { opacity: 1, color: 'warning.main' }
                }}
              >
                <RestartAlt fontSize="small" />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(clip.id);
              }}
              sx={{
                p: 0.25,
                opacity: 0.6,
                '&:hover': { opacity: 1, color: 'error.main' }
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          {isTrimmed
            ? `${formatDuration(trimmedDuration)} / ${formatDuration(clip.duration)}`
            : formatDuration(clip.duration)}
        </Typography>
      </Box>
    </Paper>
  );
}

function MediaPanel() {
  const mediaLibrary = useVideoStore((state) => state.mediaLibrary);
  const pipTrack = useVideoStore((state) => state.pipTrack);
  const removeClipFromLibrary = useVideoStore((state) => state.removeClipFromLibrary);
  const setPipTrackFromClip = useVideoStore((state) => state.setPipTrackFromClip);
  const removePipTrack = useVideoStore((state) => state.removePipTrack);
  const addClipToTimeline = useVideoStore((state) => state.addClipToTimeline);

  // Dummy handlers for library clips (not applicable)
  const handleReorder = () => {}; // Library clips don't have order
  const handleReset = () => {}; // Library clips aren't trimmed

  if (mediaLibrary.length === 0) {
    return null;
  }

  return (
    <Box sx={{
      height: 180,
      backgroundColor: 'background.paper',
      borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
      p: 2,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
        Media ({mediaLibrary.length} {mediaLibrary.length === 1 ? 'clip' : 'clips'})
      </Typography>

      {/* Clips List */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        overflowX: 'auto',
        overflowY: 'hidden',
        pb: 1,
        '&::-webkit-scrollbar': {
          height: 8,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: 4,
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 4,
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
          },
        },
      }}>
        {mediaLibrary.map((clip, index) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={index}
            totalClips={mediaLibrary.length}
            isActive={false} // Library clips aren't active
            isPipTrack={pipTrack?.clipData.id === clip.id}
            onRemove={removeClipFromLibrary}
            onReorder={handleReorder}
            onReset={handleReset}
            onSetPip={setPipTrackFromClip}
            onRemovePip={removePipTrack}
            onAddToTimeline={addClipToTimeline}
            isLibraryClip={true}
          />
        ))}
      </Box>
    </Box>
  );
}

export default MediaPanel;
