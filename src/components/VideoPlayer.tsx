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

    // Only switch video if we've moved to a different clip
    if (clip.id === currentClipId) {
      return;
    }

    console.log('[VideoPlayer] Switching to clip:', { id: clip.id, path: clip.path, hasBlobUrl: !!clip.blobUrl });

    // Use pre-loaded blob URL
    if (clip.blobUrl) {
      setVideoSrc(clip.blobUrl);
      setCurrentClipId(clip.id);
    } else {
      console.warn('[VideoPlayer] Clip does not have a blob URL yet:', clip.id);
      // Wait for blob to be loaded by useVideoMetadata
    }
  }, [clips, currentTime, getCurrentClip, currentClipId]);

  // Load new video and set time when videoSrc changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    // Capture the playing state at the moment of clip switch
    const shouldResumePlayback = isPlaying;
    const currentClip = getCurrentClip();
    console.log('[VideoPlayer] Loading new video source:', {
      videoSrc,
      shouldResumePlayback,
      isPlaying,
      clipId: currentClip?.id,
      clipName: currentClip?.name
    });

    // Force the video to load the new source
    video.load();

    // Set the correct time within the clip once metadata is loaded
    const handleLoadedMetadata = () => {
      const clip = getCurrentClip();
      if (!clip) return;

      // Time within the trimmed portion of the clip
      const timeInClip = currentTime - clip.startTimeInSequence;
      // Video element time needs to include the trimStart offset
      video.currentTime = Math.max(clip.trimStart, clip.trimStart + timeInClip);
      console.log('[VideoPlayer] Set video time to:', video.currentTime, 'for clip:', clip.id, 'trimStart:', clip.trimStart);

      // Resume playback if we were playing when the clip switched
      if (shouldResumePlayback) {
        console.log('[VideoPlayer] Resuming playback after clip switch');
        video.play().catch(err => {
          console.error('[VideoPlayer] Failed to resume playback:', err);
        });
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);

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

    // Calculate time within the trimmed portion of the clip (0 to trimmedDuration)
    const timeInClip = currentTime - clip.startTimeInSequence;
    // Video element time needs to include the trimStart offset
    const desiredVideoTime = clip.trimStart + timeInClip;

    // Only update if difference is significant (avoid feedback loop)
    if (Math.abs(video.currentTime - desiredVideoTime) > 0.5) {
      video.currentTime = Math.max(clip.trimStart, desiredVideoTime);
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

    // Video element's currentTime includes the trimStart offset
    // Subtract it to get time within the trimmed portion (0 to trimmedDuration)
    const timeInClip = video.currentTime - clip.trimStart;
    // Convert to sequence time (relative to entire timeline)
    const sequenceTime = clip.startTimeInSequence + timeInClip;
    setCurrentTime(sequenceTime);

    // Auto-pause when reaching the end of the trimmed portion
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    if (timeInClip >= trimmedDuration) {
      video.pause();
      setPlaying(false);
    }
  };

  // Handle video ended event
  const handleEnded = () => {
    // Use currentClipId to find which clip just ended
    // (getCurrentClip() might already have moved to the next clip due to time updates)
    if (!currentClipId) {
      console.log('[VideoPlayer] No current clip ID, pausing');
      setPlaying(false);
      return;
    }

    const endedClipIndex = clips.findIndex(c => c.id === currentClipId);
    if (endedClipIndex === -1) {
      console.log('[VideoPlayer] Ended clip not found, pausing');
      setPlaying(false);
      return;
    }

    console.log('[VideoPlayer] Clip ended:', {
      clipId: currentClipId,
      index: endedClipIndex,
      totalClips: clips.length
    });

    // Check if there's a next clip
    if (endedClipIndex < clips.length - 1) {
      // There's a next clip, transition to it
      const nextClip = clips[endedClipIndex + 1];
      console.log('[VideoPlayer] Moving to next clip:', nextClip.id);

      // Ensure playing state is true before transitioning
      if (!isPlaying) {
        console.log('[VideoPlayer] Setting playing state to true before clip transition');
        setPlaying(true);
      }

      setCurrentTime(nextClip.startTimeInSequence);
      // Keep playing (don't pause)
    } else {
      // This is the last clip, pause playback
      console.log('[VideoPlayer] Last clip ended, pausing');
      setPlaying(false);
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
          src={videoSrc || undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
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
        />

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
