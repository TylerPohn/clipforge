import { Box, Typography, Paper, IconButton, Stack, Chip } from '@mui/material';
import { Delete, DragIndicator } from '@mui/icons-material';
import { useVideoStore, Clip } from '../store/videoStore';
import { useVideoThumbnail } from '../hooks/useVideoThumbnail';

interface ClipCardProps {
  clip: Clip;
  index: number;
  isActive: boolean;
  onRemove: (id: string) => void;
}

function ClipCard({ clip, index, isActive, onRemove }: ClipCardProps) {
  const thumbnailUrl = useVideoThumbnail(clip.path);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return 'Loading...';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Paper
      elevation={isActive ? 8 : 2}
      sx={{
        minWidth: 160,
        width: 160,
        height: 120,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: isActive ? '2px solid #00bcd4' : '2px solid transparent',
        '&:hover': {
          elevation: 4,
          borderColor: isActive ? '#00bcd4' : 'rgba(255, 255, 255, 0.2)',
        }
      }}
    >
      {/* Drag handle */}
      <Box sx={{
        position: 'absolute',
        top: 4,
        left: 4,
        cursor: 'grab',
        opacity: 0.5,
        zIndex: 10,
        '&:hover': { opacity: 1 }
      }}>
        <DragIndicator fontSize="small" />
      </Box>

      {/* Clip number badge */}
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
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          {formatDuration(clip.duration)}
        </Typography>
      </Box>
    </Paper>
  );
}

function MediaPanel() {
  const clips = useVideoStore((state) => state.clips);
  const removeClip = useVideoStore((state) => state.removeClip);
  const currentTime = useVideoStore((state) => state.currentTime);
  const getCurrentClip = useVideoStore((state) => state.getCurrentClip);

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
            isActive={currentClip?.id === clip.id}
            onRemove={removeClip}
          />
        ))}
      </Box>
    </Box>
  );
}

export default MediaPanel;
