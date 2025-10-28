/**
 * TrackPanel Component
 *
 * Displays a list of all tracks in the composition with controls for:
 * - Selecting tracks
 * - Deleting tracks
 * - Toggling visibility
 * - Reordering tracks (drag-to-reorder)
 */

import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  IconButton,
  Stack,
  Typography,
  Divider
} from '@mui/material';
import {
  Delete,
  Visibility,
  VisibilityOff,
  DragIndicator,
  VolumeUp
} from '@mui/icons-material';
import { Track } from '../types/clip';

interface TrackPanelProps {
  tracks: Track[];
  selectedTrackId?: string;
  soloTrackId?: string;
  onSelectTrack: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleVisibility: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onReorderTrack: (trackId: string, newIndex: number) => void;
}

export function TrackPanel({
  tracks,
  selectedTrackId,
  soloTrackId,
  onSelectTrack,
  onDeleteTrack,
  onToggleVisibility,
  onToggleSolo,
  onReorderTrack
}: TrackPanelProps) {
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedTrackId) {
      onReorderTrack(draggedTrackId, targetIndex);
    }
    setDraggedTrackId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedTrackId(null);
    setDragOverIndex(null);
  };

  if (tracks.length === 0) {
    return (
      <Box sx={{
        width: 250,
        borderRight: '1px solid rgba(255, 255, 255, 0.12)',
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.paper'
      }}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No tracks yet.
          <br />
          Import clips to create tracks.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      width: 250,
      borderRight: '1px solid rgba(255, 255, 255, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'background.paper',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.12)' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
          Tracks ({tracks.length})
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Drag to reorder
        </Typography>
      </Box>

      {/* Track List */}
      <List sx={{ p: 1, overflow: 'auto', flex: 1 }}>
        {tracks.map((track, index) => {
          const isSelected = selectedTrackId === track.id;
          const isDragging = draggedTrackId === track.id;
          const isDragOver = dragOverIndex === index;

          return (
            <React.Fragment key={track.id}>
              <ListItem
                disablePadding
                sx={{
                  mb: 1,
                  border: '1px solid',
                  borderColor: isSelected ? 'primary.main' : 'rgba(255, 255, 255, 0.12)',
                  borderRadius: 1,
                  backgroundColor: isSelected
                    ? 'rgba(0, 188, 212, 0.15)'
                    : 'background.default',
                  opacity: isDragging ? 0.5 : 1,
                  cursor: 'grab',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: isSelected ? 'primary.light' : 'rgba(255, 255, 255, 0.3)',
                    backgroundColor: isSelected
                      ? 'rgba(0, 188, 212, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)'
                  },
                  '&:active': {
                    cursor: 'grabbing'
                  },
                  ...(isDragOver && {
                    borderColor: 'primary.light',
                    borderWidth: 2
                  })
                }}
                draggable
                onDragStart={(e) => handleDragStart(e, track.id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <ListItemButton
                  onClick={() => onSelectTrack(track.id)}
                  sx={{
                    flex: 1,
                    p: 1,
                    minHeight: 60
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                    <DragIndicator
                      sx={{
                        fontSize: 18,
                        color: 'text.secondary',
                        cursor: 'grab'
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {track.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {Math.round(track.duration / 1000)}s • z:{track.zIndex}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontSize: '0.65rem',
                          color: track.isVisible ? 'success.main' : 'text.disabled'
                        }}
                      >
                        {track.isVisible ? 'Visible' : 'Hidden'}
                      </Typography>
                    </Box>
                  </Stack>
                </ListItemButton>

                {/* Action Buttons */}
                <Stack direction="row" sx={{ pr: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo(track.id);
                    }}
                    sx={{
                      mr: 0.5,
                      backgroundColor: soloTrackId === track.id ? 'warning.main' : 'transparent',
                      '&:hover': {
                        backgroundColor: soloTrackId === track.id ? 'warning.dark' : 'rgba(255, 255, 255, 0.08)'
                      }
                    }}
                    title={soloTrackId === track.id ? 'Unsolo track' : 'Solo track (only this track\'s audio)'}
                  >
                    <VolumeUp
                      fontSize="small"
                      sx={{
                        color: soloTrackId === track.id ? 'warning.contrastText' : 'text.secondary'
                      }}
                    />
                  </IconButton>

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(track.id);
                    }}
                    sx={{ mr: 0.5 }}
                    title={track.isVisible ? 'Hide track' : 'Show track'}
                  >
                    {track.isVisible ? (
                      <Visibility fontSize="small" sx={{ color: 'success.main' }} />
                    ) : (
                      <VisibilityOff fontSize="small" sx={{ color: 'text.disabled' }} />
                    )}
                  </IconButton>

                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete track "${track.name}"?`)) {
                        onDeleteTrack(track.id);
                      }
                    }}
                    color="error"
                    title="Delete track"
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Stack>
              </ListItem>

              {isDragOver && index < tracks.length - 1 && (
                <Divider sx={{ mb: 1, borderColor: 'primary.main', borderWidth: 2 }} />
              )}
            </React.Fragment>
          );
        })}
      </List>
    </Box>
  );
}

export default TrackPanel;
