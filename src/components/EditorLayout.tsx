import { useState } from 'react';
import { AppBar, Toolbar, Box, Typography, Chip, Tooltip, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Layers, ViewList } from '@mui/icons-material';
import ImportButton from './ImportButton';
import RecordButton from './RecordButton';
import ExportButton from './ExportButton';
import DropZone from './DropZone';
import VideoPlayer from './VideoPlayer';
import TimelineRuler from './TimelineRuler';
import MediaPanel from './MediaPanel';
import CompositeEditorLayout from './CompositeEditorLayout';
import { useVideoStore } from '../store/videoStore';
import { useVideoMetadata } from '../hooks/useVideoMetadata';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

type ViewMode = 'sequential' | 'composite';

function EditorLayout() {
  // Load metadata when video is imported
  useVideoMetadata();
  useKeyboardShortcuts();

  const { clips, videoDuration, videoResolution } = useVideoStore();
  const [viewMode, setViewMode] = useState<ViewMode>('sequential');

  // If composite mode is active, render CompositeEditorLayout
  if (viewMode === 'composite') {
    return (
      <CompositeEditorLayout
        onSwitchToSequentialView={() => setViewMode('sequential')}
      />
    );
  }

  // Otherwise render sequential editor (original layout)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          {/* View Mode Toggle */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode) setViewMode(newMode);
            }}
            size="small"
            sx={{ mr: 2 }}
          >
            <ToggleButton value="sequential">
              <Tooltip title="Sequential View">
                <ViewList fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="composite">
              <Tooltip title="Multi-Track Composer">
                <Layers fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <ImportButton />

          <RecordButton />

          <ExportButton compositeMode={false} />
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
