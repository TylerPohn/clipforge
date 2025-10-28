import { useEffect, useState } from 'react';

declare const window: any;

/**
 * Hook to generate a thumbnail from a video file
 * @param videoPath - Path to the video file
 * @returns Data URL of the generated thumbnail or null if not yet generated
 */
export function useVideoThumbnail(videoPath: string | null): string | null {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    console.log('[useVideoThumbnail] Hook called with videoPath:', videoPath);

    if (!videoPath) {
      console.warn('[useVideoThumbnail] No videoPath provided, returning early');
      setThumbnailUrl(null);
      return;
    }

    console.log('[useVideoThumbnail] Starting thumbnail generation for:', videoPath);
    let isMounted = true;
    let videoElement: HTMLVideoElement | null = null;
    let blobUrl: string | null = null;

    const generateThumbnail = async () => {
      try {
        console.log('[useVideoThumbnail] Step 1: Checking Tauri availability');
        if (!window.__TAURI_INVOKE__) {
          console.error('[useVideoThumbnail] Tauri invoke not available');
          return;
        }

        const invoke = window.__TAURI_INVOKE__;
        console.log('[useVideoThumbnail] Step 2: Invoking get_video_file for:', videoPath);

        // Load video file using Tauri command (same as VideoPlayer)
        const videoBytes = (await invoke('get_video_file', {
          videoPath: videoPath
        })) as number[];

        console.log('[useVideoThumbnail] Step 3: Received video bytes:', videoBytes.length);

        // Convert to Uint8Array and create blob
        const uint8Array = new Uint8Array(videoBytes);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        blobUrl = URL.createObjectURL(blob);
        console.log('[useVideoThumbnail] Step 4: Created blob URL:', blobUrl);

        // Create a video element
        videoElement = document.createElement('video');
        videoElement.preload = 'auto'; // Changed from 'metadata' to 'auto' to load enough data for seeking
        videoElement.muted = true; // Mute to avoid any audio playback
        console.log('[useVideoThumbnail] Step 5: Created video element, waiting for metadata...');

        // Wait for metadata to load
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) return reject(new Error('Video element not created'));

          const onLoadedMetadata = () => {
            console.log('[useVideoThumbnail] Step 6: Metadata loaded successfully');
            videoElement?.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoElement?.removeEventListener('error', onLoadError);
            resolve();
          };

          const onLoadError = (e: Event) => {
            videoElement?.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoElement?.removeEventListener('error', onLoadError);
            console.error('[useVideoThumbnail] Video load error:', e);
            reject(new Error('Failed to load video metadata'));
          };

          videoElement.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
          videoElement.addEventListener('error', onLoadError, { once: true });
          videoElement.src = blobUrl!;
          // Explicitly call load() to start loading video data
          videoElement.load();
        });

        console.log('[useVideoThumbnail] Step 7: Waiting for canplay...');

        // Wait for video to be playable before seeking
        let canplayTimeout: NodeJS.Timeout | null = null;
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) return reject(new Error('Video element not created'));

          const onCanPlay = () => {
            console.log('[useVideoThumbnail] Step 8: Video can play');
            if (canplayTimeout) clearTimeout(canplayTimeout);
            videoElement?.removeEventListener('canplay', onCanPlay);
            videoElement?.removeEventListener('error', onCanPlayError);
            resolve();
          };

          const onCanPlayError = (e: Event) => {
            if (canplayTimeout) clearTimeout(canplayTimeout);
            videoElement?.removeEventListener('canplay', onCanPlay);
            videoElement?.removeEventListener('error', onCanPlayError);
            console.error('[useVideoThumbnail] Video canplay error:', e);
            reject(new Error('Video not ready for playback'));
          };

          if (videoElement.readyState >= 2) {
            // Already in canplay or better state
            console.log('[useVideoThumbnail] Step 8: Video already ready (readyState:', videoElement.readyState, ')');
            resolve();
          } else {
            videoElement.addEventListener('canplay', onCanPlay, { once: true });
            videoElement.addEventListener('error', onCanPlayError, { once: true });

            // Timeout fallback: if canplay doesn't fire in 5 seconds, proceed anyway
            canplayTimeout = setTimeout(() => {
              videoElement?.removeEventListener('canplay', onCanPlay);
              videoElement?.removeEventListener('error', onCanPlayError);
              console.warn('[useVideoThumbnail] Canplay timeout - proceeding with readyState:', videoElement?.readyState);
              resolve();
            }, 5000);
          }
        });

        // Seek to 1 second or 10% of duration, whichever is smaller
        const seekTime = Math.min(1, videoElement.duration * 0.1);
        console.log('[useVideoThumbnail] Step 9: Seeking to time:', seekTime, 'Duration:', videoElement.duration);

        // Wait for the seek to complete with timeout fallback
        let seekTimeout: NodeJS.Timeout | null = null;
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) return reject(new Error('Video element not created'));

          const onSeeked = () => {
            console.log('[useVideoThumbnail] Step 10: Seek completed');
            if (seekTimeout) clearTimeout(seekTimeout);
            videoElement?.removeEventListener('seeked', onSeeked);
            videoElement?.removeEventListener('error', onSeekError);
            resolve();
          };

          const onSeekError = (e: Event) => {
            if (seekTimeout) clearTimeout(seekTimeout);
            videoElement?.removeEventListener('seeked', onSeeked);
            videoElement?.removeEventListener('error', onSeekError);
            console.error('[useVideoThumbnail] Video seek error:', e);
            reject(new Error('Failed to seek video'));
          };

          // Set up event listeners BEFORE seeking to prevent race conditions
          videoElement.addEventListener('seeked', onSeeked, { once: true });
          videoElement.addEventListener('error', onSeekError, { once: true });

          // Fallback timeout: if seek doesn't complete in 3 seconds, proceed anyway
          // Some containers don't reliably fire seeked events
          seekTimeout = setTimeout(() => {
            videoElement?.removeEventListener('seeked', onSeeked);
            videoElement?.removeEventListener('error', onSeekError);
            console.warn('[useVideoThumbnail] Seek timeout - proceeding with current frame');
            resolve();
          }, 3000);

          // Now set currentTime to trigger seek
          videoElement.currentTime = seekTime;
        });

        // Create canvas and draw the current frame
        console.log('[useVideoThumbnail] Step 11: Drawing to canvas. Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        console.log('[useVideoThumbnail] Step 12: Canvas draw complete, converting to data URL...');

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        console.log('[useVideoThumbnail] Successfully generated thumbnail for:', videoPath, 'Data URL length:', dataUrl.length);

        if (isMounted) {
          setThumbnailUrl(dataUrl);
        }
      } catch (error) {
        console.error('[useVideoThumbnail] Failed to generate thumbnail:', error);
        if (isMounted) {
          setThumbnailUrl(null);
        }
      } finally {
        // Clean up
        if (videoElement) {
          videoElement.src = '';
          videoElement.load();
        }
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      }
    };

    generateThumbnail();

    return () => {
      isMounted = false;
      if (videoElement) {
        videoElement.src = '';
        videoElement.load();
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [videoPath]);

  return thumbnailUrl;
}
