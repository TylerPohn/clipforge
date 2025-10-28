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
    if (!videoPath) {
      setThumbnailUrl(null);
      return;
    }

    let isMounted = true;
    let videoElement: HTMLVideoElement | null = null;
    let blobUrl: string | null = null;

    const generateThumbnail = async () => {
      try {
        if (!window.__TAURI_INVOKE__) {
          console.error('[useVideoThumbnail] Tauri invoke not available');
          return;
        }

        const invoke = window.__TAURI_INVOKE__;

        // Load video file using Tauri command (same as VideoPlayer)
        const videoBytes = (await invoke('get_video_file', {
          videoPath: videoPath
        })) as number[];

        // Convert to Uint8Array and create blob
        const uint8Array = new Uint8Array(videoBytes);
        const blob = new Blob([uint8Array], { type: 'video/mp4' });
        blobUrl = URL.createObjectURL(blob);

        // Create a video element
        videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        videoElement.muted = true; // Mute to avoid any audio playback

        // Wait for metadata to load
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) return reject(new Error('Video element not created'));

          videoElement.onloadedmetadata = () => resolve();
          videoElement.onerror = (e) => {
            console.error('[useVideoThumbnail] Video load error:', e);
            reject(new Error('Failed to load video'));
          };
          videoElement.src = blobUrl!;
        });

        // Seek to 1 second or 10% of duration, whichever is smaller
        const seekTime = Math.min(1, videoElement.duration * 0.1);
        videoElement.currentTime = seekTime;

        // Wait for the seek to complete
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) return reject(new Error('Video element not created'));

          videoElement.onseeked = () => resolve();
          videoElement.onerror = (e) => {
            console.error('[useVideoThumbnail] Video seek error:', e);
            reject(new Error('Failed to seek video'));
          };
        });

        // Create canvas and draw the current frame
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

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
