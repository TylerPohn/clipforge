/**
 * TrackPropertiesPanel Component
 *
 * Displays and allows editing of properties for the currently selected track:
 * - Volume (0-1)
 * - Opacity (0-1)
 * - Position (X/Y coordinates)
 * - Visibility toggle
 */
import {
  Box,
  Slider,
  Typography,
  Stack,
  Switch,
  FormControlLabel,
  TextField,
  Divider,
  Chip
} from '@mui/material';
import { Track } from '../types/clip';

interface TrackPropertiesPanelProps {
  track: Track | undefined;
  onUpdatePosition: (x: number, y: number) => void;
  onUpdateVolume: (volume: number) => void;
  onUpdateOpacity: (opacity: number) => void;
  onUpdateVisibility: (visible: boolean) => void;
}

export function TrackPropertiesPanel({
  track,
  onUpdatePosition,
  onUpdateVolume,
  onUpdateOpacity,
  onUpdateVisibility
}: TrackPropertiesPanelProps) {
  if (!track) {
    return (
      <Box sx={{
        width: 250,
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.paper',
        textAlign: 'center'
      }}>
        <Typography variant="body2" color="text.secondary">
          Select a track to edit properties
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      width: 250,
      borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'background.paper',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          Properties
        </Typography>
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {track.name}
        </Typography>
      </Box>

      {/* Properties Content */}
      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
        {/* Track Info */}
        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1}>
            <Chip label={`z:${track.zIndex}`} size="small" />
            <Chip label={`${Math.round(track.duration / 1000)}s`} size="small" variant="outlined" />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {track.clipData.width}x{track.clipData.height}
          </Typography>
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {/* Visibility */}
        <FormControlLabel
          control={
            <Switch
              checked={track.isVisible}
              onChange={(e) => onUpdateVisibility(e.target.checked)}
              color="success"
            />
          }
          label={
            <Typography variant="body2">
              Visible
            </Typography>
          }
          sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', ml: 0, mr: 0 }}
        />

        <Divider sx={{ mb: 3 }} />

        {/* Volume */}
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2">Volume</Typography>
            <Typography variant="caption" color="primary">
              {Math.round(track.volume * 100)}%
            </Typography>
          </Stack>
          <Slider
            value={track.volume}
            onChange={(_, value) => onUpdateVolume(value as number)}
            min={0}
            max={1}
            step={0.01}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            marks={[
              { value: 0, label: '0%' },
              { value: 0.5, label: '50%' },
              { value: 1, label: '100%' }
            ]}
          />
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {/* Opacity */}
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2">Opacity</Typography>
            <Typography variant="caption" color="primary">
              {Math.round(track.opacity * 100)}%
            </Typography>
          </Stack>
          <Slider
            value={track.opacity}
            onChange={(_, value) => onUpdateOpacity(value as number)}
            min={0}
            max={1}
            step={0.01}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
            marks={[
              { value: 0, label: '0%' },
              { value: 0.5, label: '50%' },
              { value: 1, label: '100%' }
            ]}
          />
        </Stack>

        <Divider sx={{ mb: 3 }} />

        {/* Position */}
        <Stack spacing={2}>
          <Typography variant="body2">Position</Typography>

          {/* X Position */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              X: {track.position.x}px
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="number"
                value={track.position.x}
                onChange={(e) => {
                  const newX = parseInt(e.target.value) || 0;
                  onUpdatePosition(newX, track.position.y);
                }}
                size="small"
                sx={{ width: 80 }}
                inputProps={{
                  step: 10,
                  min: -1000,
                  max: 1000
                }}
              />
              <Slider
                value={track.position.x}
                onChange={(_, value) => onUpdatePosition(value as number, track.position.y)}
                min={-500}
                max={500}
                step={1}
                size="small"
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>

          {/* Y Position */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Y: {track.position.y}px
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                type="number"
                value={track.position.y}
                onChange={(e) => {
                  const newY = parseInt(e.target.value) || 0;
                  onUpdatePosition(track.position.x, newY);
                }}
                size="small"
                sx={{ width: 80 }}
                inputProps={{
                  step: 10,
                  min: -1000,
                  max: 1000
                }}
              />
              <Slider
                value={track.position.y}
                onChange={(_, value) => onUpdatePosition(track.position.x, value as number)}
                min={-500}
                max={500}
                step={1}
                size="small"
                sx={{ flex: 1 }}
              />
            </Stack>
          </Box>

          {/* Reset Position Button */}
          <Typography
            variant="caption"
            color="primary"
            sx={{
              cursor: 'pointer',
              textDecoration: 'underline',
              '&:hover': { color: 'primary.light' }
            }}
            onClick={() => onUpdatePosition(0, 0)}
          >
            Reset to center (0, 0)
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

export default TrackPropertiesPanel;
