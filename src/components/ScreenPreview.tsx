import { useEffect, useState } from 'react';
import { Box, Alert, Typography, Chip } from '@mui/material';
import { DesktopWindows, FiberManualRecord } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface ScreenPreviewProps {
  isActive: boolean;
  isRecording?: boolean;
}

function ScreenPreview({ isActive, isRecording = false }: ScreenPreviewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isActive) {
      // Stop preview when not active
      invoke('stop_screen_preview').catch(() => {
        // Ignore errors if preview wasn't running
      });
      setFrame(null);
      setIsLoading(true);
      return;
    }

    // Start the preview
    let unlistenFn: (() => void) | null = null;

    const startPreview = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Start the preview stream
        await invoke('start_screen_preview');

        // Listen for frame events
        const unlisten = await listen<string>('screen-preview-frame', (event) => {
          setFrame(event.payload);
          setIsLoading(false);
        });

        unlistenFn = unlisten;
      } catch (err: any) {
        console.error('Screen preview error:', err);
        setError(
          err.includes('permission')
            ? 'Screen recording permission denied. Please allow screen recording in System Settings.'
            : `Preview error: ${err}`
        );
        setIsLoading(false);
      }
    };

    startPreview();

    return () => {
      // Clean up
      if (unlistenFn) {
        unlistenFn();
      }
      invoke('stop_screen_preview').catch(() => {
        // Ignore errors
      });
    };
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <Box sx={{
      width: '100%',
      maxWidth: 400,
      mx: 'auto',
      mb: 2
    }}>
      {error ? (
        <Alert severity="error" icon={<DesktopWindows />}>
          {error}
        </Alert>
      ) : (
        <Box sx={{
          position: 'relative',
          paddingTop: '56.25%', // 16:9 aspect ratio
          backgroundColor: 'black',
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Screen preview"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          ) : (
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2
            }}>
              <DesktopWindows sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {isLoading ? 'Loading screen preview...' : 'No preview available'}
              </Typography>
            </Box>
          )}

          {/* Recording Indicator Overlay */}
          {isRecording && frame && (
            <Chip
              icon={<FiberManualRecord />}
              label="REC"
              color="error"
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                left: 8,
                fontWeight: 'bold',
                animation: 'blink 1.5s ease-in-out infinite',
                '@keyframes blink': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.6 }
                }
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
}

export default ScreenPreview;
