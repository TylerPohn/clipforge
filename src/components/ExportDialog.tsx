import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  Alert,
  FormGroup,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';
import { VideoResolution, RESOLUTION_OPTIONS } from '../types/recording';
import { Track } from '../types/clip';
import ResolutionSelector from './ResolutionSelector';

declare const window: any;

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  compositeMode?: boolean;
  // Sequential mode props
  inputPath?: string | null;
  trimStart?: number;
  trimEnd?: number;
  videoName?: string | null;
  videoResolution?: { width: number; height: number };
  // Composite mode props
  tracks?: Track[];
}

function ExportDialog({
  open,
  onClose,
  compositeMode = false,
  inputPath,
  trimStart = 0,
  trimEnd = 0,
  videoName,
  videoResolution,
  tracks = []
}: ExportDialogProps) {
  const [status, setStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<VideoResolution>(VideoResolution['720P']);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Initialize selected tracks with visible tracks when dialog opens
  useEffect(() => {
    if (open && compositeMode && tracks.length > 0) {
      const visibleTrackIds = new Set(
        tracks.filter(t => t.isVisible).map(t => t.id)
      );
      setSelectedTrackIds(visibleTrackIds);
    }
  }, [open, compositeMode, tracks]);

  // Listen for FFmpeg progress events
  useEffect(() => {
    if (!open) return;

    // Set up event listener for export progress
    const handleProgressEvent = (event: any) => {
      const line = event.detail?.payload || '';

      // Parse FFmpeg time output
      // Example: "time=00:00:05.23"
      const match = String(line).match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseFloat(match[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;

        const duration = trimEnd - trimStart;
        const progressPercent = Math.min(100, (currentTime / duration) * 100);
        setProgress(progressPercent);
      }
    };

    // Add the event listener
    window.addEventListener('export-progress', handleProgressEvent);

    return () => {
      window.removeEventListener('export-progress', handleProgressEvent);
    };
  }, [open, trimStart, trimEnd]);

  // Start export
  const handleExport = async () => {
    console.log('[ExportDialog] Starting export...');
    console.log('[ExportDialog] compositeMode:', compositeMode);
    setStatus('exporting');
    setProgress(0);
    setError(null);

    try {
      if (!window.__TAURI_INVOKE__) {
        throw new Error('Tauri context not available');
      }

      const invoke = window.__TAURI_INVOKE__;
      console.log('[ExportDialog] Tauri context available');

      // Determine default filename
      const defaultName = compositeMode
        ? 'composite_export.mp4'
        : (videoName || 'export').replace(/\.(mp4|mov)$/i, '_trimmed.mp4');
      console.log('[ExportDialog] Opening save dialog with default name:', defaultName);

      const savePath = (await invoke('save_file_dialog', {
        defaultFilename: defaultName
      })) as string;

      console.log('[ExportDialog] Save dialog result:', savePath);

      if (!savePath) {
        console.log('[ExportDialog] User cancelled save dialog');
        setStatus('idle');
        return; // User cancelled
      }

      // Ensure .mp4 extension
      const finalOutputPath = savePath.endsWith('.mp4') ? savePath : `${savePath}.mp4`;
      console.log('[ExportDialog] Final output path:', finalOutputPath);

      if (compositeMode) {
        // Composite export
        const selectedTracks = tracks.filter(t => selectedTrackIds.has(t.id));

        if (selectedTracks.length === 0) {
          throw new Error('No tracks selected for export');
        }

        console.log('[ExportDialog] Exporting', selectedTracks.length, 'tracks');

        // Determine canvas size (use largest track dimensions)
        const canvasWidth = Math.max(...selectedTracks.map(t => t.clipData.width));
        const canvasHeight = Math.max(...selectedTracks.map(t => t.clipData.height));

        // Prepare track data for Rust
        const trackData = selectedTracks.map(t => ({
          path: t.clipData.path,
          position_x: t.position.x,
          position_y: t.position.y,
          volume: t.volume,
          opacity: t.opacity,
          width: t.clipData.width,
          height: t.clipData.height,
          z_index: t.zIndex
        }));

        const exportOptions = {
          resolution: selectedResolution,
          source_width: canvasWidth,
          source_height: canvasHeight
        };

        console.log('[ExportDialog] Calling export_composite_video with:', {
          outputPath: finalOutputPath,
          tracks: trackData,
          canvasWidth,
          canvasHeight,
          exportOptions
        });

        const result = (await invoke('export_composite_video', {
          outputPath: finalOutputPath,
          tracks: trackData,
          canvasWidth,
          canvasHeight,
          exportOptions
        })) as string;

        console.log('[ExportDialog] export_composite_video completed:', result);
        setOutputPath(result);
        setStatus('success');
        setProgress(100);

      } else {
        // Sequential export (existing logic)
        const exportOptions = {
          resolution: selectedResolution,
          source_width: videoResolution?.width,
          source_height: videoResolution?.height,
        };

        console.log('[ExportDialog] Calling trim_video with:', {
          inputPath,
          outputPath: finalOutputPath,
          startTime: trimStart,
          endTime: trimEnd,
          exportOptions
        });

        const result = (await invoke('trim_video', {
          inputPath,
          outputPath: finalOutputPath,
          startTime: trimStart,
          endTime: trimEnd,
          exportOptions
        })) as string;

        console.log('[ExportDialog] trim_video completed:', result);
        setOutputPath(result);
        setStatus('success');
        setProgress(100);
      }

    } catch (err: any) {
      console.error('[ExportDialog] Export failed:', err);
      setError(err.toString());
      setStatus('error');
    }
  };

  // Open output folder
  const openFolder = async () => {
    if (outputPath && window.__TAURI_INVOKE__) {
      try {
        console.log('[ExportDialog] Opening folder for path:', outputPath);

        // Extract folder path (works for both / and \ separators)
        const folderPath = outputPath.substring(0, Math.max(
          outputPath.lastIndexOf('/'),
          outputPath.lastIndexOf('\\')
        ));

        console.log('[ExportDialog] Extracted folder path:', folderPath);

        const invoke = window.__TAURI_INVOKE__;
        await invoke('plugin:opener|open_path', { path: folderPath });

        console.log('[ExportDialog] Successfully opened folder');
      } catch (err) {
        console.error('[ExportDialog] Failed to open folder:', err);
      }
    }
  };

  // Reset and close
  const handleClose = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setOutputPath(null);
    onClose();
  };

  // Don't auto-start export - user must select resolution and click Export button

  return (
    <Dialog open={open} onClose={status === 'exporting' ? undefined : handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {status === 'exporting' && 'Exporting Video...'}
        {status === 'success' && 'Export Complete!'}
        {status === 'error' && 'Export Failed'}
        {status === 'idle' && 'Export Video'}
      </DialogTitle>

      <DialogContent>
        {status === 'idle' && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Export Settings
            </Typography>

            {compositeMode && tracks.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" gutterBottom>
                  Select tracks to export:
                </Typography>
                <FormGroup>
                  {tracks.map(track => (
                    <FormControlLabel
                      key={track.id}
                      control={
                        <Checkbox
                          checked={selectedTrackIds.has(track.id)}
                          onChange={(e) => {
                            const newSelection = new Set(selectedTrackIds);
                            if (e.target.checked) {
                              newSelection.add(track.id);
                            } else {
                              newSelection.delete(track.id);
                            }
                            setSelectedTrackIds(newSelection);
                          }}
                        />
                      }
                      label={
                        <Typography variant="body2">
                          {track.name} {!track.isVisible && '(hidden)'}
                        </Typography>
                      }
                    />
                  ))}
                </FormGroup>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {selectedTrackIds.size} {selectedTrackIds.size === 1 ? 'track' : 'tracks'} selected
                </Typography>
              </Box>
            )}

            <Box sx={{ mb: 3, mt: 2 }}>
              <ResolutionSelector
                value={selectedResolution}
                onChange={setSelectedResolution}
                source="screen"
                sourceResolution={videoResolution}
              />
            </Box>

            {!compositeMode && (
              <Typography variant="caption" color="text.secondary" display="block">
                Video will be trimmed from {trimStart.toFixed(1)}s to {trimEnd.toFixed(1)}s
              </Typography>
            )}
          </Box>
        )}

        {status === 'exporting' && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Exporting at {RESOLUTION_OPTIONS[selectedResolution].label}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Trimming video from {trimStart.toFixed(1)}s to {trimEnd.toFixed(1)}s
            </Typography>
            <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {progress.toFixed(0)}%
            </Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="body1" gutterBottom>
              Video exported successfully!
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {outputPath}
            </Typography>
          </Box>
        )}

        {status === 'error' && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {status === 'idle' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button onClick={handleExport} variant="contained">Export</Button>
          </>
        )}

        {status === 'success' && (
          <>
            <Button onClick={openFolder}>Open Folder</Button>
            <Button onClick={handleClose} variant="contained">Done</Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Button onClick={handleExport}>Retry</Button>
            <Button onClick={handleClose}>Close</Button>
          </>
        )}

        {status === 'exporting' && (
          <Typography variant="caption" color="text.secondary">
            Please wait...
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ExportDialog;
