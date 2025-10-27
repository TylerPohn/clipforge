import { useEffect } from 'react';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

export function useVideoMetadata() {
  const videoPath = useVideoStore((state) => state.videoPath);
  const setMetadata = useVideoStore((state) => state.setMetadata);

  useEffect(() => {
    if (!videoPath) {
      console.log('[useVideoMetadata] No video path provided');
      return;
    }

    console.log('[useVideoMetadata] Fetching metadata for:', videoPath);

    const fetchMetadata = async () => {
      try {
        // Get the invoke function from Tauri's global context
        if (!window.__TAURI_INVOKE__) {
          throw new Error('Tauri context not available');
        }

        const invoke = window.__TAURI_INVOKE__;

        console.log('[useVideoMetadata] Calling get_video_metadata command...');
        const metadataJson = (await invoke('get_video_metadata', {
          videoPath
        })) as string;

        console.log('[useVideoMetadata] Received metadata response');
        const metadata = JSON.parse(metadataJson);

        console.log('[useVideoMetadata] Parsed metadata:', {
          streams: metadata.streams.length,
          format: metadata.format
        });

        // Extract video stream (usually first video stream)
        const videoStream = metadata.streams.find(
          (s: any) => s.codec_type === 'video'
        );

        if (!videoStream) {
          throw new Error('No video stream found');
        }

        // Parse duration
        const duration = parseFloat(metadata.format.duration);

        // Parse resolution
        const resolution = {
          width: videoStream.width,
          height: videoStream.height
        };

        // Update store
        setMetadata(duration, resolution);

        console.log('[useVideoMetadata] Metadata loaded successfully:', { duration, resolution });

      } catch (error) {
        console.error('[useVideoMetadata] Failed to load metadata:', error);
      }
    };

    fetchMetadata();
  }, [videoPath, setMetadata]);
}
