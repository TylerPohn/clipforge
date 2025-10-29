import { Box, Typography, Paper, IconButton, Stack, Chip } from '@mui/material';
import { Delete, ArrowBack, ArrowForward, RestartAlt, PictureInPictureAlt } from '@mui/icons-material';
import { useVideoStore, Clip } from '../store/videoStore';
import { useVideoThumbnail } from '../hooks/useVideoThumbnail';

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
}

function ClipCard({ clip, index, totalClips, isActive, isPipTrack, onRemove, onReorder, onReset, onSetPip, onRemovePip }: ClipCardProps) {
  console.log('[MediaPanel] ClipCard rendering for clip:', { id: clip.id, name: clip.name, path: clip.path, hasPath: !!clip.path });
  // Use trimStart as the thumbnail seek time so split clips get unique thumbnails
  const thumbnailUrl = useVideoThumbnail(clip.path, clip.trimStart);
  console.log('[MediaPanel] Thumbnail URL for clip', clip.name, ':', thumbnailUrl ? 'Generated' : 'null', 'seekTime:', clip.trimStart);

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

  return (
    <Paper
      elevation={isActive ? 8 : 2}
      sx={{
        minWidth: 160,
        width: 160,
        height: 120,
        position: 'relative',
        transition: 'all 0.2s',
        border: isPipTrack ? '2px solid #9c27b0' : isActive ? '2px solid #00bcd4' : '2px solid transparent',
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
  const clips = useVideoStore((state) => state.clips);
  const pipTrack = useVideoStore((state) => state.pipTrack);
  const removeClip = useVideoStore((state) => state.removeClip);
  const reorderClip = useVideoStore((state) => state.reorderClip);
  const resetClipTrim = useVideoStore((state) => state.resetClipTrim);
  const getCurrentClip = useVideoStore((state) => state.getCurrentClip);
  const setPipTrackFromClip = useVideoStore((state) => state.setPipTrackFromClip);
  const removePipTrack = useVideoStore((state) => state.removePipTrack);

  const currentClip = getCurrentClip();

  if (clips.length === 0) {
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
        Media ({clips.length} {clips.length === 1 ? 'clip' : 'clips'})
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
        {clips.map((clip, index) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={index}
            totalClips={clips.length}
            isActive={currentClip?.id === clip.id}
            isPipTrack={pipTrack?.clipData.id === clip.id}
            onRemove={removeClip}
            onReorder={reorderClip}
            onReset={resetClipTrim}
            onSetPip={setPipTrackFromClip}
            onRemovePip={removePipTrack}
          />
        ))}
      </Box>
    </Box>
  );
}

export default MediaPanel;
