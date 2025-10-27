import { useRef, useEffect, useState } from 'react';
import { Box, IconButton, Slider, Typography, Stack } from '@mui/material';
import {
  PlayArrow,
  Pause,
  VolumeUp,
  VolumeOff
} from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const {
    videoPath,
    isPlaying,
    currentTime,
    volume,
    videoDuration,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setVolume
  } = useVideoStore();

  // Fetch video file and create blob URL
  useEffect(() => {
    if (!videoPath) {
      console.log('[VideoPlayer] No video path, clearing src');
      setVideoSrc(null);
      return;
    }

    console.log('[VideoPlayer] Loading video from path:', videoPath);

    const loadVideo = async () => {
      try {
        if (!window.__TAURI_INVOKE__) {
          console.error('[VideoPlayer] Tauri invoke not available');
          return;
        }

        const invoke = window.__TAURI_INVOKE__;
        console.log('[VideoPlayer] Calling get_video_file command...');

        const videoBytes = (await invoke('get_video_file', {
          videoPath: videoPath
        })) as number[];

        console.log('[VideoPlayer] Received video bytes:', videoBytes.length);

        // Convert to Uint8Array and create blob
        const uint8Array = new Uint8Array(videoBytes);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        console.log('[VideoPlayer] Created blob URL:', blobUrl);
        setVideoSrc(blobUrl);
      } catch (e) {
        console.error('[VideoPlayer] Failed to load video file:', e);
      }
    };

    loadVideo();
  }, [videoPath]);

  // Log video source conversion with detailed path info
  useEffect(() => {
    console.log('[VideoPlayer] Video source changed:', {
      videoPath,
      videoSrc,
      videoDuration,
      isPlaying,
      isValidUrl: videoSrc ? videoSrc.startsWith('asset://') || videoSrc.startsWith('http') : false
    });
  }, [videoPath, videoSrc, videoDuration, isPlaying]);

  // Sync video element with store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.log('[VideoPlayer] Video element ref is null');
      return;
    }

    console.log('[VideoPlayer] Play/pause sync:', { isPlaying, readyState: video.readyState, currentTime: video.currentTime });

    if (isPlaying) {
      // Only try to play if video is ready
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA or better
        console.log('[VideoPlayer] Attempting to play... (readyState:', video.readyState, ')');
        video.play()
          .then(() => {
            console.log('[VideoPlayer] Play successful');
          })
          .catch(err => {
            console.error('[VideoPlayer] Play failed:', err);
            setPlaying(false);
          });
      } else {
        console.log('[VideoPlayer] Video not ready yet, waiting... (readyState:', video.readyState, ')');
        // Set up a one-time listener for when video is ready
        const handleCanPlay = () => {
          console.log('[VideoPlayer] Video is now ready, playing...');
          video.play().catch(err => {
            console.error('[VideoPlayer] Play after canplay failed:', err);
            setPlaying(false);
          });
          video.removeEventListener('canplay', handleCanPlay);
        };
        video.addEventListener('canplay', handleCanPlay);
        return () => video.removeEventListener('canplay', handleCanPlay);
      }
    } else {
      console.log('[VideoPlayer] Pausing...');
      video.pause();
    }
  }, [isPlaying, setPlaying]);

  // Update video time when store changes (for seeking)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Only update if difference is significant (avoid feedback loop)
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  // Update volume when store changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    // Auto-pause at trim end point
    if (trimEnd && video.currentTime >= trimEnd) {
      video.pause();
      setPlaying(false);
      video.currentTime = trimEnd;
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    console.log('[VideoPlayer] Toggle play/pause clicked:', { currentIsPlaying: isPlaying });
    setPlaying(!isPlaying);
  };

  // Handle seek
  const handleSeek = (_: Event, value: number | number[]) => {
    const newTime = Array.isArray(value) ? value[0] : value;
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setVolume(volume > 0 ? 0 : 1);
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!videoSrc) {
    return null; // No video loaded
  }

  return (
    <Box sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#000',
      position: 'relative',
      minHeight: 0 // Important for flex children to shrink properly
    }}>
      {/* Video Element */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <video
          ref={videoRef}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={() => {
            console.log('[VideoPlayer] Metadata loaded:', {
              duration: videoRef.current?.duration,
              videoWidth: videoRef.current?.videoWidth,
              videoHeight: videoRef.current?.videoHeight
            });
          }}
          onCanPlay={() => {
            console.log('[VideoPlayer] Can play event fired');
          }}
          onPlay={() => {
            console.log('[VideoPlayer] Play event fired');
          }}
          onPause={() => {
            console.log('[VideoPlayer] Pause event fired');
          }}
          onError={(e) => {
            const video = e.currentTarget;
            console.error('[VideoPlayer] Video error:', {
              error: video.error,
              errorCode: video.error?.code,
              errorMessage: video.error?.message,
              src: videoSrc,
              networkState: video.networkState,
              readyState: video.readyState
            });
          }}
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
        >
          {videoSrc && (
            <source src={videoSrc} type="video/mp4" />
          )}
        </video>

        {/* Play/Pause Overlay (shows when paused) */}
        {!isPlaying && (
          <Box
            onClick={togglePlayPause}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(0,0,0,0.3)',
              transition: 'background-color 0.2s'
            }}
          >
            <PlayArrow sx={{ fontSize: 80, color: 'white' }} />
          </Box>
        )}
      </Box>

      {/* Controls Bar */}
      <Box sx={{
        height: 80,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        px: 3,
        py: 2
      }}>
        {/* Seek Slider */}
        <Slider
          value={currentTime}
          min={0}
          max={videoDuration || 100}
          onChange={handleSeek}
          size="small"
          sx={{ mb: 1 }}
        />

        {/* Control Buttons */}
        <Stack direction="row" alignItems="center" spacing={2}>
          {/* Play/Pause */}
          <IconButton onClick={togglePlayPause} color="primary">
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>

          {/* Time Display */}
          <Typography variant="body2" sx={{ minWidth: 100 }}>
            {formatTime(currentTime)} / {formatTime(videoDuration || 0)}
          </Typography>

          <Box sx={{ flex: 1 }} />

          {/* Volume */}
          <IconButton onClick={toggleMute} size="small">
            {volume > 0 ? <VolumeUp /> : <VolumeOff />}
          </IconButton>
          <Slider
            value={volume}
            min={0}
            max={1}
            step={0.1}
            onChange={(_, val) => setVolume(Array.isArray(val) ? val[0] : val)}
            sx={{ width: 100 }}
            size="small"
          />
        </Stack>
      </Box>
    </Box>
  );
}

export default VideoPlayer;
