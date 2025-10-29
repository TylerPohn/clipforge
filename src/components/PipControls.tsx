import { Box, Typography, Paper, IconButton, Stack, Slider, Button, ButtonGroup, Chip } from '@mui/material';
import { Close, VolumeUp } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

function PipControls() {
  const pipTrack = useVideoStore((state) => state.pipTrack);
  const removePipTrack = useVideoStore((state) => state.removePipTrack);
  const updatePipTrackPosition = useVideoStore((state) => state.updatePipTrackPosition);
  const updatePipTrackVolume = useVideoStore((state) => state.updatePipTrackVolume);
  const updatePipTrackSize = useVideoStore((state) => state.updatePipTrackSize);

  if (!pipTrack) {
    return null;
  }

  // Determine current position based on pipTrack.position
  // This is a simplified version - we'll determine the corner based on coordinates
  const getCurrentCorner = (): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' => {
    const { x, y } = pipTrack.position;
    const isLeft = x < 100;
    const isTop = y < 100;

    if (isTop && isLeft) return 'top-left';
    if (isTop && !isLeft) return 'top-right';
    if (!isTop && isLeft) return 'bottom-left';
    return 'bottom-right';
  };

  const currentCorner = getCurrentCorner();

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: 280,
        p: 2,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="subtitle2" fontWeight="bold">
            PiP Controls
          </Typography>
          <Chip
            label={pipTrack.name}
            size="small"
            sx={{ maxWidth: 120, fontSize: '0.65rem' }}
          />
        </Stack>
        <IconButton size="small" onClick={removePipTrack} title="Remove PiP track">
          <Close fontSize="small" />
        </IconButton>
      </Stack>

      {/* Position Section */}
      <Box mb={2}>
        <Typography variant="caption" color="text.secondary" mb={1} display="block">
          Position
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Stack spacing={0.5} flex={1}>
            <Button
              variant={currentCorner === 'top-left' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => updatePipTrackPosition('top-left')}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              Top Left
            </Button>
            <Button
              variant={currentCorner === 'bottom-left' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => updatePipTrackPosition('bottom-left')}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              Bottom Left
            </Button>
          </Stack>
          <Stack spacing={0.5} flex={1}>
            <Button
              variant={currentCorner === 'top-right' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => updatePipTrackPosition('top-right')}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              Top Right
            </Button>
            <Button
              variant={currentCorner === 'bottom-right' ? 'contained' : 'outlined'}
              size="small"
              onClick={() => updatePipTrackPosition('bottom-right')}
              sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}
            >
              Bottom Right
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Size Section */}
      <Box mb={2}>
        <Typography variant="caption" color="text.secondary" mb={1} display="block">
          Size
        </Typography>
        <ButtonGroup size="small" fullWidth>
          <Button onClick={() => updatePipTrackSize(25)} sx={{ fontSize: '0.7rem' }}>
            25%
          </Button>
          <Button onClick={() => updatePipTrackSize(33)} sx={{ fontSize: '0.7rem' }}>
            33%
          </Button>
          <Button onClick={() => updatePipTrackSize(50)} sx={{ fontSize: '0.7rem' }}>
            50%
          </Button>
        </ButtonGroup>
      </Box>

      {/* Volume Section */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <VolumeUp fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            Volume
          </Typography>
          <Slider
            value={pipTrack.volume}
            onChange={(_, value) => updatePipTrackVolume(value as number)}
            min={0}
            max={1}
            step={0.01}
            size="small"
            sx={{ flex: 1 }}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
          />
          <Typography variant="caption" color="text.secondary" minWidth={35}>
            {Math.round(pipTrack.volume * 100)}%
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}

export default PipControls;
