import { useState } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { useVideoStore } from '../store/videoStore';

interface DropZoneProps {
  children?: React.ReactNode;
}

function DropZone({ children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const setVideo = useVideoStore((state) => state.setVideo);
  const videoPath = useVideoStore((state) => state.videoPath);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const fileName = file.name;

      // Validate extension
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === 'mp4' || ext === 'mov') {
        // In the Tauri app context, we can access the full path
        // In browser, we use the file name as identifier
        const filePath = (file as any).path || fileName;
        setVideo(filePath, fileName);
        console.log('File dropped:', filePath);
      } else {
        alert('Please drop an MP4 or MOV file');
      }
    }
  };

  // Show drop zone only when no video is loaded
  if (videoPath) {
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
