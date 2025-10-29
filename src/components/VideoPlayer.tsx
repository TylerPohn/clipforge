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
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [pipVideoSrc, setPipVideoSrc] = useState<string | null>(null);
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);

  const {
    clips,
    mediaLibrary,
    pipTrack,
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

  // Load PiP video when pipTrack changes
  useEffect(() => {
    if (!pipTrack) {
      setPipVideoSrc(null);
      return;
    }

    // Find the original clip to get its blob URL - check both timeline and library
    let originalClip = clips.find(c => c.id === pipTrack.clipData.id);
    if (!originalClip) {
      originalClip = mediaLibrary.find(c => c.id === pipTrack.clipData.id);
    }

    // Also try to find by path if ID doesn't match (in case of split clips)
    if (!originalClip) {
      originalClip = clips.find(c => c.path === pipTrack.clipData.path);
    }
    if (!originalClip) {
      originalClip = mediaLibrary.find(c => c.path === pipTrack.clipData.path);
    }

    if (originalClip?.blobUrl) {
      // Use the pre-loaded blob URL from the original clip
      setPipVideoSrc(originalClip.blobUrl);
      console.log('[VideoPlayer] PiP video loaded from clip blob URL:', originalClip.blobUrl);
    } else {
      // Fallback: Convert file path to blob URL using Tauri
      const loadPipVideo = async () => {
        try {
          const { convertFileSrc } = window.__TAURI__.tauri;
          const pipBlobUrl = convertFileSrc(pipTrack.clipData.path);
          setPipVideoSrc(pipBlobUrl);
          console.log('[VideoPlayer] PiP video loaded via convertFileSrc:', pipBlobUrl);
        } catch (error) {
          console.error('[VideoPlayer] Failed to load PiP video:', error);
        }
      };

      loadPipVideo();
    }
  }, [pipTrack, clips, mediaLibrary]);

  // Sync PiP video playback with main video
  useEffect(() => {
    const pipVideo = pipVideoRef.current;
    if (!pipVideo || !pipTrack || !pipVideoSrc) return;

    // Calculate if PiP should be visible at current time (offset is in milliseconds)
    const pipStartTime = pipTrack.offset / 1000; // Convert to seconds
    const pipEndTime = pipStartTime + (pipTrack.duration / 1000);
    const shouldBeVisible = currentTime >= pipStartTime && currentTime < pipEndTime;

    if (!shouldBeVisible) {
      pipVideo.pause();
      return;
    }

    // Calculate time within PiP clip
    const timeInPip = currentTime - pipStartTime;

    // Only update if difference is significant
    if (Math.abs(pipVideo.currentTime - timeInPip) > 0.5) {
      pipVideo.currentTime = Math.max(0, timeInPip);
    }

    // Sync play/pause state
    if (isPlaying && pipVideo.paused) {
      pipVideo.play().catch(err => {
        console.error('[VideoPlayer] Failed to play PiP video:', err);
      });
    } else if (!isPlaying && !pipVideo.paused) {
      pipVideo.pause();
    }
  }, [pipTrack, pipVideoSrc, currentTime, isPlaying]);

  // Set PiP video volume
  useEffect(() => {
    const pipVideo = pipVideoRef.current;
    if (!pipVideo || !pipTrack) return;
    pipVideo.volume = pipTrack.volume;
  }, [pipTrack]);

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
      isValidUrl: videoSrc ? videoSrc.startsWith('blob:') : false,
      hasPipTrack: !!pipTrack
    });
  }, [currentClipId, videoSrc, videoDuration, isPlaying, currentTime, getCurrentClip, pipTrack]);

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

    // Check if we've reached the end of the trimmed portion
    const trimmedDuration = clip.trimEnd - clip.trimStart;
    if (timeInClip >= trimmedDuration - 0.05) { // Small threshold to catch end
      // Calculate the end of this clip in the timeline
      const clipEndTime = clip.startTimeInSequence + trimmedDuration;

      // Check if there's any clip after this point in the timeline
      const hasNextClip = clips.some(c =>
        c.startTimeInSequence >= clipEndTime && c.duration !== null
      );

      if (hasNextClip) {
        // Move playhead slightly past the end to trigger transition to next clip
        console.log('[VideoPlayer] Clip end reached, moving to next timeline position:', clipEndTime);
        setCurrentTime(clipEndTime + 0.01);
        // Keep playing
      } else {
        // No more clips in the timeline, pause
        console.log('[VideoPlayer] Timeline end reached, pausing');
        video.pause();
        setPlaying(false);
      }
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

        {/* PiP Video Overlay */}
        {pipTrack && pipVideoSrc && (() => {
          const pipStartTime = pipTrack.offset / 1000;
          const pipEndTime = pipStartTime + (pipTrack.duration / 1000);
          const shouldBeVisible = currentTime >= pipStartTime && currentTime < pipEndTime;

          if (!shouldBeVisible) return null;

          // Calculate position based on corner (simplified)
          // The position values are relative to the parent container
          const getCornerStyle = () => {
            const { x, y } = pipTrack.position;
            const isLeft = x < 100;
            const isTop = y < 100;
            const margin = 20;

            if (isTop && isLeft) {
              return { top: margin, left: margin };
            } else if (isTop && !isLeft) {
              return { top: margin, right: margin };
            } else if (!isTop && isLeft) {
              return { bottom: 100 + margin, left: margin }; // Add 100 for controls bar
            } else {
              return { bottom: 100 + margin, right: margin };
            }
          };

          return (
            <video
              ref={pipVideoRef}
              src={pipVideoSrc}
              onError={(e) => {
                console.error('[VideoPlayer] PiP video error:', e);
              }}
              style={{
                position: 'absolute',
                width: '25%', // Default 25% size
                height: 'auto',
                maxWidth: '50%',
                zIndex: 999,
                border: '2px solid #9c27b0',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                objectFit: 'contain',
                ...getCornerStyle()
              }}
            />
          );
        })()}

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
