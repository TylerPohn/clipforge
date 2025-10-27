import { AppBar, Toolbar, Button, Box, Typography, Chip } from '@mui/material';
import { FiberManualRecord, FileDownload } from '@mui/icons-material';
import ImportButton from './ImportButton';
import DropZone from './DropZone';
import VideoPlayer from './VideoPlayer';
import { useVideoStore } from '../store/videoStore';
import { useVideoMetadata } from '../hooks/useVideoMetadata';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function EditorLayout() {
  // Load metadata when video is imported
  useVideoMetadata();
  useKeyboardShortcuts();

  const { videoName, videoDuration, videoResolution } = useVideoStore();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          <ImportButton />

          <Button color="inherit" startIcon={<FiberManualRecord />} sx={{ mr: 2 }}>
            Record
          </Button>

          <Button color="inherit" startIcon={<FileDownload />}>
            Export
          </Button>
        </Toolbar>
      </AppBar>

      {/* Video info chips */}
      {videoName && (
        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <Chip label={videoName} color="primary" />
          {videoDuration && (
            <Chip label={`${videoDuration.toFixed(1)}s`} />
          )}
          {videoResolution && (
            <Chip label={`${videoResolution.width}x${videoResolution.height}`} />
          )}
        </Box>
      )}

      {/* Main Content Area with Drop Zone */}
      <DropZone>
        <VideoPlayer />
      </DropZone>

      {/* Timeline Footer */}
      <Box sx={{
        height: 120,
        backgroundColor: 'background.paper',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        p: 2,
      }}>
        <Typography variant="body2" color="text.secondary">
          Timeline will appear here
        </Typography>
      </Box>
    </Box>
  );
}

export default EditorLayout;
