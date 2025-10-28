import { useEffect, useRef } from 'react';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

export function useVideoMetadata() {
  const clips = useVideoStore((state) => state.clips);
  const updateClipMetadata = useVideoStore((state) => state.updateClipMetadata);

  // Keep track of which clips we've already fetched metadata for
  const fetchedClipIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Process each clip that doesn't have metadata yet
    clips.forEach((clip) => {
      // Skip if already fetched or already has metadata
      if (fetchedClipIds.current.has(clip.id) || clip.duration !== null) {
        return;
      }

      console.log('[useVideoMetadata] Fetching metadata for clip:', { id: clip.id, path: clip.path });

      // Mark as being fetched
      fetchedClipIds.current.add(clip.id);

      const fetchMetadata = async () => {
        try {
          // Get the invoke function from Tauri's global context
          if (!window.__TAURI_INVOKE__) {
            throw new Error('Tauri context not available');
          }

          const invoke = window.__TAURI_INVOKE__;

          console.log('[useVideoMetadata] Calling get_video_metadata command for clip:', clip.id);
          const metadataJson = (await invoke('get_video_metadata', {
            videoPath: clip.path
          })) as string;

          console.log('[useVideoMetadata] Received metadata response for clip:', clip.id);
          const metadata = JSON.parse(metadataJson);

          console.log('[useVideoMetadata] Parsed metadata:', {
            clipId: clip.id,
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

          // Update clip metadata in store
          updateClipMetadata(clip.id, duration, resolution);

          console.log('[useVideoMetadata] Metadata loaded successfully for clip:', {
            clipId: clip.id,
            duration,
            resolution
          });

        } catch (error) {
          console.error('[useVideoMetadata] Failed to load metadata for clip:', clip.id, error);
          // Remove from fetched set so we can retry
          fetchedClipIds.current.delete(clip.id);
        }
      };

      fetchMetadata();
    });
  }, [clips, updateClipMetadata]);
}
