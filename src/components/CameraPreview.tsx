import { useEffect, useRef, useState } from 'react';
import { Box, Alert, Typography } from '@mui/material';
import { Videocam, VideocamOff } from '@mui/icons-material';

interface CameraPreviewProps {
  isActive: boolean;
}

function CameraPreview({ isActive }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!isActive) {
      // Stop stream when preview is not active
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('getUserMedia not available in Tauri WebView');
      setError(null); // Don't show error, just no preview
      setHasPermission(true); // Skip preview
      return;
    }

    // Request camera access
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });

        setStream(mediaStream);
        setHasPermission(true);
        setError(null);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

      } catch (err: any) {
        console.error('Camera access error:', err);
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access.'
            : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a camera.'
            : `Camera error: ${err.message || err}`
        );
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  // Check if preview is available
  const isPreviewAvailable = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

  return (
    <Box sx={{
      width: '100%',
      maxWidth: 400,
      mx: 'auto',
      mb: 2
    }}>
      {error ? (
        <Alert severity="error" icon={<VideocamOff />}>
          {error}
        </Alert>
      ) : !isPreviewAvailable ? (
        <Alert severity="info" icon={<Videocam />}>
          <Typography variant="body2">
            Camera preview not available in this environment. Recording will work normally - you just won't see the preview before starting.
          </Typography>
        </Alert>
      ) : (
        <Box sx={{
          position: 'relative',
          paddingTop: '75%', // 4:3 aspect ratio
          backgroundColor: 'black',
          borderRadius: 1,
          overflow: 'hidden'
        }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />

          {!hasPermission && (
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
              <Videocam sx={{ fontSize: 48, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Requesting camera access...
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default CameraPreview;
