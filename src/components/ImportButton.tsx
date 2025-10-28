import { useState } from 'react';
import { Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import { VideoFile } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

declare const window: any;

function ImportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addClip = useVideoStore((state) => state.addClip);

  const handleImport = async () => {
    console.log('[ImportButton] Import clicked');
    setLoading(true);
    setError(null);

    try {
      // Get the invoke function from Tauri's global context
      if (!window.__TAURI_INVOKE__) {
        throw new Error('Tauri context not available');
      }

      console.log('[ImportButton] Opening file dialog...');
      const invoke = window.__TAURI_INVOKE__;

      // Call Tauri command to open file dialog
      const filePath = (await invoke('open_file_dialog')) as string;
      console.log('[ImportButton] File selected:', filePath);

      // Extract filename from path
      const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
      console.log('[ImportButton] File name:', fileName);

      // Validate file extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext !== 'mp4' && ext !== 'mov') {
        throw new Error('Please select an MP4 or MOV file');
      }

      // Add clip to store (now supports multiple clips)
      console.log('[ImportButton] Adding clip to store:', { filePath, fileName });
      const clipId = addClip(filePath, fileName);

      console.log('[ImportButton] Clip added successfully:', { clipId, filePath });

    } catch (err: any) {
      console.error('[ImportButton] Import error:', err);
      if (err !== 'No file selected') {
        setError(err.toString());
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <VideoFile />}
        onClick={handleImport}
        disabled={loading}
        sx={{ mr: 2 }}
      >
        Import
      </Button>

      {/* Error notification */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

export default ImportButton;
