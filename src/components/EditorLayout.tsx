import { AppBar, Toolbar, Box, Typography, Chip } from '@mui/material';
import ImportButton from './ImportButton';
import RecordButton from './RecordButton';
import ExportButton from './ExportButton';
import DropZone from './DropZone';
import VideoPlayer from './VideoPlayer';
import TimelineRuler from './TimelineRuler';
import MediaPanel from './MediaPanel';
import { useVideoStore } from '../store/videoStore';
import { useVideoMetadata } from '../hooks/useVideoMetadata';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function EditorLayout() {
  // Load metadata when video is imported
  useVideoMetadata();
  useKeyboardShortcuts();

  const { clips, videoDuration, videoResolution } = useVideoStore();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          <ImportButton />

          <RecordButton />

          <ExportButton />
        </Toolbar>
      </AppBar>

      {/* Sequence info chips */}
      {clips.length > 0 && (
        <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
          <Chip label={`${clips.length} ${clips.length === 1 ? 'Clip' : 'Clips'}`} color="primary" />
          {videoDuration && (
            <Chip label={`Total: ${videoDuration.toFixed(1)}s`} />
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

      {/* Media Panel - shows all imported clips */}
      <MediaPanel />

      {/* Timeline Footer */}
      <TimelineRuler />
    </Box>
  );
}

export default EditorLayout;
