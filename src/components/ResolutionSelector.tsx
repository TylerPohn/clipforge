import { Box, ToggleButtonGroup, ToggleButton, Typography, Stack, Alert } from '@mui/material';
import { VideoResolution, RESOLUTION_OPTIONS } from '../types/recording';

interface ResolutionSelectorProps {
  value: VideoResolution;
  onChange: (resolution: VideoResolution) => void;
  source: 'screen' | 'camera';
  sourceResolution?: { width: number; height: number };
}

export function ResolutionSelector({
  value,
  onChange,
  source,
  sourceResolution
}: ResolutionSelectorProps) {
  const getDisplayResolution = (resolution: VideoResolution): string => {
    if (resolution === VideoResolution.SOURCE && sourceResolution) {
      return `${sourceResolution.width}x${sourceResolution.height}`;
    }
    return resolution;
  };

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Output Resolution:
      </Typography>

      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, newResolution) => {
          if (newResolution) onChange(newResolution);
        }}
        fullWidth
      >
        {Object.values(RESOLUTION_OPTIONS).map(option => (
          <ToggleButton key={option.id} value={option.id}>
            <Stack alignItems="center" spacing={0.5} sx={{ py: 1 }}>
              <Typography variant="body2" fontWeight="bold">
                {getDisplayResolution(option.id as VideoResolution)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.estimatedFileSize}
              </Typography>
            </Stack>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Description */}
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>{RESOLUTION_OPTIONS[value].label}:</strong>{' '}
          {RESOLUTION_OPTIONS[value].description}
        </Typography>
        {sourceResolution && value === VideoResolution.SOURCE && (
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Source: {sourceResolution.width}x{sourceResolution.height}
          </Typography>
        )}
      </Alert>
    </Box>
  );
}

export default ResolutionSelector;
