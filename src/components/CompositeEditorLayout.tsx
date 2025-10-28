/**
 * CompositeEditorLayout Component
 *
 * Layout for multi-track composition editing.
 * Structure:
 * - Top: AppBar with actions
 * - Middle: TrackPanel | CompositeCanvas | TrackPropertiesPanel
 * - Bottom: TrackTimeline
 */

import { Box, AppBar, Toolbar, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import { ViewList } from '@mui/icons-material';
import ImportButton from './ImportButton';
import RecordButton from './RecordButton';
import ExportButton from './ExportButton';
import TrackPanel from './TrackPanel';
import TrackPropertiesPanel from './TrackPropertiesPanel';
import CompositeCanvas from './CompositeCanvas';
import TrackTimeline from './TrackTimeline';
import { useMultiTrack } from '../hooks/useMultiTrack';
import { useVideoStore } from '../store/videoStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface CompositeEditorLayoutProps {
  onSwitchToSequentialView?: () => void;
}

export function CompositeEditorLayout({ onSwitchToSequentialView }: CompositeEditorLayoutProps) {
  useKeyboardShortcuts();

  const {
    tracks,
    selectedTrackId,
    soloTrackId,
    selectedTrack,
    isPlayingComposite,
    currentTime,
    removeTrack,
    selectTrack,
    reorderTrack,
    updateTrackPosition,
    updateTrackVolume,
    updateTrackOpacity,
    updateTrackOffset,
    toggleTrackVisibility,
    toggleSoloTrack,
    playComposite,
    pauseComposite,
    seekComposite
  } = useMultiTrack();

  const { clips } = useVideoStore();

  // Toggle play/pause
  const handlePlayPause = () => {
    if (isPlayingComposite) {
      pauseComposite();
    } else {
      playComposite();
    }
  };

  // Handle visibility toggle
  const handleToggleVisibility = (trackId: string) => {
    toggleTrackVisibility(trackId);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge - Multi-Track Composer
          </Typography>

          {onSwitchToSequentialView && (
            <Tooltip title="Switch to sequential view">
              <IconButton onClick={onSwitchToSequentialView} color="inherit" sx={{ mr: 2 }}>
                <ViewList />
              </IconButton>
            </Tooltip>
          )}

          <ImportButton />
          <RecordButton />
          <ExportButton compositeMode={true} />
        </Toolbar>
      </AppBar>

      {/* Info Chips */}
      {tracks.length > 0 && (
        <Box sx={{ p: 2, display: 'flex', gap: 1, borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
          <Chip
            label={`${tracks.length} Track${tracks.length !== 1 ? 's' : ''}`}
            color="primary"
          />
          <Chip
            label={`${clips.length} Source Clip${clips.length !== 1 ? 's' : ''}`}
            variant="outlined"
          />
          {selectedTrack && (
            <Chip
              label={`Selected: ${selectedTrack.name}`}
              color="secondary"
              variant="outlined"
            />
          )}
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Panel: Track List */}
        <TrackPanel
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          soloTrackId={soloTrackId}
          onSelectTrack={selectTrack}
          onDeleteTrack={removeTrack}
          onToggleVisibility={handleToggleVisibility}
          onToggleSolo={toggleSoloTrack}
          onReorderTrack={reorderTrack}
        />

        {/* Center: Composite Canvas */}
        <CompositeCanvas
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          soloTrackId={soloTrackId}
          isPlaying={isPlayingComposite}
          currentTime={currentTime}
          onPlayPause={handlePlayPause}
          onSelectTrack={selectTrack}
          onUpdateTrackPosition={updateTrackPosition}
        />

        {/* Right Panel: Track Properties */}
        <TrackPropertiesPanel
          track={selectedTrack}
          onUpdatePosition={(x, y) => {
            if (selectedTrackId) updateTrackPosition(selectedTrackId, x, y);
          }}
          onUpdateVolume={(volume) => {
            if (selectedTrackId) updateTrackVolume(selectedTrackId, volume);
          }}
          onUpdateOpacity={(opacity) => {
            if (selectedTrackId) updateTrackOpacity(selectedTrackId, opacity);
          }}
          onUpdateVisibility={(visible) => {
            if (selectedTrackId) {
              const track = tracks.find(t => t.id === selectedTrackId);
              if (track && track.isVisible !== visible) {
                toggleTrackVisibility(selectedTrackId);
              }
            }
          }}
        />
      </Box>

      {/* Bottom: Track Timeline */}
      <TrackTimeline
        tracks={tracks}
        selectedTrackId={selectedTrackId}
        isPlaying={isPlayingComposite}
        currentTime={currentTime}
        onPlayPause={handlePlayPause}
        onSeek={seekComposite}
        onSelectTrack={selectTrack}
        onUpdateTrackOffset={updateTrackOffset}
      />
    </Box>
  );
}

export default CompositeEditorLayout;
