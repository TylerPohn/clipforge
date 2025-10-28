import { useState } from 'react';
import { Button } from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';
import ExportDialog from './ExportDialog';

function ExportButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    videoPath,
    videoName,
    videoDuration,
    videoResolution,
    trimStart,
    trimEnd
  } = useVideoStore();

  // Can't export if no video or trim duration is zero
  const canExport = videoPath && videoDuration && (trimEnd - trimStart) > 0;

  const handleClick = () => {
    console.log('[ExportButton] Export button clicked');
    console.log('[ExportButton] canExport:', canExport);
    console.log('[ExportButton] videoPath:', videoPath);
    console.log('[ExportButton] videoDuration:', videoDuration);
    console.log('[ExportButton] trimStart:', trimStart);
    console.log('[ExportButton] trimEnd:', trimEnd);
    console.log('[ExportButton] trim duration:', trimEnd - trimStart);

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

      {videoPath && videoName && (
        <ExportDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          inputPath={videoPath}
          trimStart={trimStart}
          trimEnd={trimEnd}
          videoName={videoName}
          videoResolution={videoResolution || undefined}
        />
      )}
    </>
  );
}

export default ExportButton;
