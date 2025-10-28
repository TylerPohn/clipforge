import { useState } from 'react';
import { Button } from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';
import ExportDialog from './ExportDialog';

interface ExportButtonProps {
  compositeMode?: boolean; // Whether we're in composite editing mode
}

function ExportButton({ compositeMode = false }: ExportButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    clips,
    videoPath,
    videoName,
    videoDuration,
    videoResolution,
    composite
  } = useVideoStore();

  // For composite mode: can export if there are visible tracks
  // For sequential mode: can export if clips exist
  const canExport = compositeMode
    ? composite.tracks.length > 0 && composite.tracks.some(t => t.isVisible)
    : clips.length > 0 && videoDuration;

  const handleClick = () => {
    console.log('[ExportButton] Export button clicked');
    console.log('[ExportButton] compositeMode:', compositeMode);
    console.log('[ExportButton] canExport:', canExport);

    if (compositeMode) {
      console.log('[ExportButton] Tracks:', composite.tracks.length);
      console.log('[ExportButton] Visible tracks:', composite.tracks.filter(t => t.isVisible).length);
    } else {
      console.log('[ExportButton] videoPath:', videoPath);
      console.log('[ExportButton] videoDuration:', videoDuration);
      console.log('[ExportButton] clips:', clips.length);
    }

    if (canExport) {
      console.log('[ExportButton] Opening export dialog');
      setDialogOpen(true);
    } else {
      console.log('[ExportButton] Export not available - button should be disabled');
    }
  };

  return (
    <>
      <Button
        color="inherit"
        startIcon={<FileDownload />}
        onClick={handleClick}
        disabled={!canExport}
      >
        Export
      </Button>

      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        compositeMode={compositeMode}
        // Sequential mode props
        clips={clips}
        inputPath={videoPath}
        videoName={videoName}
        videoResolution={videoResolution || undefined}
        // Composite mode props
        tracks={compositeMode ? composite.tracks : []}
      />
    </>
  );
}

export default ExportButton;
