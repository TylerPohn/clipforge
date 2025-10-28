declare const window: any;

export async function loadVideoBlob(clipId: string, videoPath: string): Promise<string | null> {
  try {
    if (!window.__TAURI_INVOKE__) {
      console.error('[VideoLoader] Tauri invoke not available');
      return null;
    }

    const invoke = window.__TAURI_INVOKE__;
    console.log('[VideoLoader] Loading video file for clip:', clipId);

    const videoBytes = (await invoke('get_video_file', {
      videoPath: videoPath
    })) as number[];

    console.log('[VideoLoader] Received video bytes:', videoBytes.length, 'for clip:', clipId);

    // Convert to Uint8Array and create blob
    const uint8Array = new Uint8Array(videoBytes);
    const blob = new Blob([uint8Array], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);

    console.log('[VideoLoader] Created blob URL for clip:', clipId, blobUrl);
    return blobUrl;
  } catch (e) {
    console.error('[VideoLoader] Failed to load video file for clip:', clipId, e);
    return null;
  }
}
