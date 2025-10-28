import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScreenResolution, CameraCapabilities } from '../types/recording';

interface RecordingResolution {
  width: number;
  height: number;
}

export function useRecordingResolution(source: 'screen' | 'camera') {
  const [sourceResolution, setSourceResolution] = useState<RecordingResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadResolution = async () => {
      try {
        setLoading(true);
        if (source === 'screen') {
          const resolution = await invoke<ScreenResolution>('get_screen_resolution');
          setSourceResolution({
            width: resolution.width,
            height: resolution.height
          });
        } else {
          const caps = await invoke<CameraCapabilities>('get_camera_capabilities');
          setSourceResolution({
            width: caps.nativeWidth,
            height: caps.nativeHeight
          });
        }
        setError(null);
      } catch (err: any) {
        console.error(`Failed to get ${source} resolution:`, err);
        setError(err.message || `Failed to get ${source} resolution`);
      } finally {
        setLoading(false);
      }
    };

    loadResolution();
  }, [source]);

  return { sourceResolution, loading, error };
}
