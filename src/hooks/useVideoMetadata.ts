import { useEffect, useRef } from 'react';
import { useVideoStore } from '../store/videoStore';
import { ClipData } from '../types/clip';
import { loadVideoBlob } from '../utils/videoLoader';

declare const window: any;

export function useVideoMetadata() {
  const mediaLibrary = useVideoStore((state) => state.mediaLibrary);
  const clips = useVideoStore((state) => state.clips);
  const updateLibraryClipMetadata = useVideoStore((state) => state.updateLibraryClipMetadata);
  const updateLibraryClipBlobUrl = useVideoStore((state) => state.updateLibraryClipBlobUrl);
  const updateClipMetadata = useVideoStore((state) => state.updateClipMetadata);
  const updateClipBlobUrl = useVideoStore((state) => state.updateClipBlobUrl);
  const addTrack = useVideoStore((state) => state.addTrack);

  // Keep track of which clips we've already fetched metadata for
  const fetchedClipIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Process both library clips and timeline clips
    const allClips = [...mediaLibrary, ...clips];

    allClips.forEach((clip) => {
      // Determine if this is a library clip or timeline clip
      const isLibraryClip = mediaLibrary.some(c => c.id === clip.id);
      // Skip if already fetched
      if (fetchedClipIds.current.has(clip.id)) {
        return;
      }

      // Skip if already has both metadata and blob URL
      if (clip.duration !== null && clip.blobUrl !== null) {
        return;
      }

      console.log('[useVideoMetadata] Processing clip:', {
        id: clip.id,
        path: clip.path,
        hasDuration: clip.duration !== null,
        hasBlobUrl: clip.blobUrl !== null
      });

      // Mark as being fetched
      fetchedClipIds.current.add(clip.id);

      const fetchMetadata = async () => {
        try {
          // Get the invoke function from Tauri's global context
          if (!window.__TAURI_INVOKE__) {
            throw new Error('Tauri context not available');
          }

          const invoke = window.__TAURI_INVOKE__;

          let duration = clip.duration;
          let resolution = clip.resolution;

          // Only fetch metadata if not already present
          if (duration === null || resolution === null) {
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
            duration = parseFloat(metadata.format.duration);

            // Parse resolution
            resolution = {
              width: videoStream.width,
              height: videoStream.height
            };

            // Update clip metadata in store (use correct method based on clip type)
            if (isLibraryClip) {
              updateLibraryClipMetadata(clip.id, duration, resolution);
            } else {
              updateClipMetadata(clip.id, duration, resolution);
            }

            console.log('[useVideoMetadata] Metadata loaded successfully for clip:', {
              clipId: clip.id,
              duration,
              resolution,
              isLibrary: isLibraryClip
            });
          } else {
            console.log('[useVideoMetadata] Clip already has metadata, skipping metadata fetch:', clip.id);
          }

          // Always load blob if missing
          if (!clip.blobUrl) {
            console.log('[useVideoMetadata] Loading blob for clip:', clip.id);
            const blobUrl = await loadVideoBlob(clip.id, clip.path);
            if (blobUrl) {
              if (isLibraryClip) {
                updateLibraryClipBlobUrl(clip.id, blobUrl);
              } else {
                updateClipBlobUrl(clip.id, blobUrl);
              }
              console.log('[useVideoMetadata] Blob loaded successfully for clip:', clip.id);
            } else {
              console.error('[useVideoMetadata] Failed to load blob for clip:', clip.id);
            }
          } else {
            console.log('[useVideoMetadata] Clip already has blob URL:', clip.id);
          }

          // Create a track in the composite state (only if we just loaded metadata and it's a timeline clip)
          if (duration && resolution && !clip.duration && !isLibraryClip) {
            const clipData: ClipData = {
              id: clip.id,
              path: clip.path,
              name: clip.name,
              duration: duration * 1000, // Convert to milliseconds
              width: resolution.width,
              height: resolution.height
            };

            addTrack(clipData);
            console.log('[useVideoMetadata] Track created for clip:', clip.id);
          }

        } catch (error) {
          console.error('[useVideoMetadata] Failed to load metadata for clip:', clip.id, error);
          // Remove from fetched set so we can retry
          fetchedClipIds.current.delete(clip.id);
        }
      };

      fetchMetadata();
    });
  }, [mediaLibrary, clips, updateLibraryClipMetadata, updateLibraryClipBlobUrl, updateClipMetadata, updateClipBlobUrl, addTrack]);
}
