import { useState, useEffect } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface DropZoneProps {
  children?: React.ReactNode;
}

// Global flag to prevent duplicate listener setup
let globalListenerSetup = false;
let globalUnlisten: (() => void) | null = null;

// Track recently processed files to prevent duplicates
const recentlyProcessed = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 1000; // 1 second window to catch duplicates

function DropZone({ children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const clips = useVideoStore((state) => state.clips);

  useEffect(() => {
    // Prevent duplicate listener setup globally
    if (globalListenerSetup) {
      console.log('[DropZone] Listener already set up globally, skipping');
      return;
    }

    // Set flag immediately to prevent race condition
    globalListenerSetup = true;

    const setupFileDropListener = async () => {
      try {
        // Get the current window from Tauri
        const currentWindow = getCurrentWindow();

        // Listen for file drop events
        globalUnlisten = await currentWindow.onDragDropEvent((event: any) => {
          console.log('[DropZone] Drag drop event:', event);

          if (event.payload.type === 'over') {
            // We can't update state here since we're outside component scope
            // Visual feedback will be handled by Tauri
          } else if (event.payload.type === 'drop') {
            const { paths } = event.payload;

            if (paths && paths.length > 0) {
              // Handle each dropped file
              paths.forEach((filePath: string) => {
                console.log('[DropZone] File dropped:', filePath);

                // Check if this file was recently processed
                const now = Date.now();
                const lastProcessed = recentlyProcessed.get(filePath);

                if (lastProcessed && (now - lastProcessed) < DUPLICATE_WINDOW_MS) {
                  console.log('[DropZone] Skipping duplicate file drop:', filePath);
                  return;
                }

                // Mark this file as processed
                recentlyProcessed.set(filePath, now);

                // Clean up old entries (older than 2x the window)
                for (const [path, timestamp] of recentlyProcessed.entries()) {
                  if (now - timestamp > DUPLICATE_WINDOW_MS * 2) {
                    recentlyProcessed.delete(path);
                  }
                }

                // Extract filename from path
                const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';

                // Validate extension
                const ext = fileName.split('.').pop()?.toLowerCase();
                if (ext === 'mp4' || ext === 'mov') {
                  // Access store directly instead of through hook
                  const clipId = useVideoStore.getState().addClip(filePath, fileName);
                  console.log('[DropZone] Clip added:', { clipId, filePath, fileName });
                } else {
                  alert('Please drop an MP4 or MOV file');
                }
              });
            }
          }
        });

        console.log('[DropZone] File drop listener set up successfully');
      } catch (error) {
        console.error('[DropZone] Error setting up file drop listener:', error);
        globalListenerSetup = false; // Reset on error
      }
    };

    setupFileDropListener();

    // Don't cleanup on unmount - keep the global listener alive
    return () => {
      // Intentionally empty - we want the listener to persist
    };
  }, []);

  // Keep these for visual feedback in case HTML5 drag events still fire
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Tauri events will handle the actual drop
  };

  // Show drop zone only when no clips are loaded
  if (clips.length > 0) {
    return <>{children}</>;
  }

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
      }}
    >
      <Paper
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        elevation={isDragging ? 8 : 2}
        sx={{
          p: 6,
          textAlign: 'center',
          backgroundColor: isDragging ? 'primary.dark' : 'background.paper',
          border: `2px dashed ${isDragging ? '#00bcd4' : 'rgba(255, 255, 255, 0.23)'}`,
          transition: 'all 0.3s ease',
          minWidth: 400,
          cursor: 'pointer',
        }}
      >
        <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          {isDragging ? 'Drop video here' : 'Import a video'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Drag and drop an MP4 or MOV file, or use the Import button
        </Typography>
      </Paper>
    </Box>
  );
}

export default DropZone;
