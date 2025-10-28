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
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);

  const {
    clips,
    isPlaying,
    currentTime,
    volume,
    videoDuration,
    trimStart,
    trimEnd,
    setPlaying,
    setCurrentTime,
    setVolume,
    getCurrentClip
  } = useVideoStore();

  // Determine which clip should be playing based on current time
  useEffect(() => {
    const clip = getCurrentClip();

    if (!clip) {
      console.log('[VideoPlayer] No clip to play');
      setVideoSrc(null);
      setCurrentClipId(null);
      return;
    }

    // Only load new video if we've switched to a different clip
    if (clip.id === currentClipId) {
      return;
    }

    console.log('[VideoPlayer] Loading clip:', { id: clip.id, path: clip.path });

    const loadVideo = async () => {
      try {
        if (!window.__TAURI_INVOKE__) {
          console.error('[VideoPlayer] Tauri invoke not available');
          return;
        }

        const invoke = window.__TAURI_INVOKE__;
        console.log('[VideoPlayer] Calling get_video_file command for clip:', clip.id);

        const videoBytes = (await invoke('get_video_file', {
          videoPath: clip.path
        })) as number[];

        console.log('[VideoPlayer] Received video bytes:', videoBytes.length);

        // Convert to Uint8Array and create blob
        const uint8Array = new Uint8Array(videoBytes);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);

        console.log('[VideoPlayer] Created blob URL for clip:', clip.id, blobUrl);
        setVideoSrc(blobUrl);
        setCurrentClipId(clip.id);

        // Set video element's time to the correct position within this clip
        if (videoRef.current) {
          const timeInClip = currentTime - clip.startTimeInSequence;
          videoRef.current.currentTime = Math.max(0, timeInClip);
        }
      } catch (e) {
        console.error('[VideoPlayer] Failed to load video file for clip:', clip.id, e);
      }
    };

    loadVideo();
  }, [clips, currentTime, getCurrentClip, currentClipId]);

  // Log video source changes
  useEffect(() => {
    const clip = getCurrentClip();
    console.log('[VideoPlayer] Video source changed:', {
      currentClipId,
      clipPath: clip?.path,
      videoSrc,
      videoDuration,
      isPlaying,
      currentTime,
      isValidUrl: videoSrc ? videoSrc.startsWith('blob:') : false
    });
  }, [currentClipId, videoSrc, videoDuration, isPlaying, currentTime, getCurrentClip]);

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
    const clip = getCurrentClip();
    if (!video || !clip) return;

    // Calculate time within the current clip
    const timeInClip = currentTime - clip.startTimeInSequence;

    // Only update if difference is significant (avoid feedback loop)
    if (Math.abs(video.currentTime - timeInClip) > 0.5) {
      video.currentTime = Math.max(0, timeInClip);
    }
  }, [currentTime, getCurrentClip]);

  // Update volume when store changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
  }, [volume]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    const clip = getCurrentClip();
    if (!video || !clip) return;

    // Convert video element's time (relative to clip) to sequence time (relative to entire timeline)
    const sequenceTime = clip.startTimeInSequence + video.currentTime;
    setCurrentTime(sequenceTime);

    // Check if we've reached the end of this clip and need to move to the next one
    const clipEndTime = clip.startTimeInSequence + (clip.duration || 0);
    if (sequenceTime >= clipEndTime && isPlaying) {
      // Find next clip
      const currentClipIndex = clips.findIndex(c => c.id === clip.id);
      if (currentClipIndex < clips.length - 1) {
        // Move to start of next clip
        const nextClip = clips[currentClipIndex + 1];
        setCurrentTime(nextClip.startTimeInSequence);
      } else {
        // We're at the end of the last clip, pause playback
        video.pause();
        setPlaying(false);
        setCurrentTime(clipEndTime);
      }
    }

    // Auto-pause at trim end point (global timeline trim)
    if (trimEnd && sequenceTime >= trimEnd) {
      video.pause();
      setPlaying(false);
      setCurrentTime(trimEnd);
    }

    // Skip to trim start if playing before it (global timeline trim)
    if (trimStart && sequenceTime < trimStart && isPlaying) {
      setCurrentTime(trimStart);
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

  if (!videoSrc || clips.length === 0) {
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
