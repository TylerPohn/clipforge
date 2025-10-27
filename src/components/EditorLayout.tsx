import { AppBar, Toolbar, Button, Box, Typography } from '@mui/material';
import {
  VideoFile,
  FiberManualRecord,
  FileDownload
} from '@mui/icons-material';

function EditorLayout() {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Top Navigation Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            ClipForge
          </Typography>

          <Button
            color="inherit"
            startIcon={<VideoFile />}
            sx={{ mr: 2 }}
          >
            Import
          </Button>

          <Button
            color="inherit"
            startIcon={<FiberManualRecord />}
            sx={{ mr: 2 }}
          >
            Record
          </Button>

          <Button
            color="inherit"
            startIcon={<FileDownload />}
          >
            Export
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main Content Area */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
      }}>
        <Typography variant="h5" color="text.secondary">
          Import a video to get started
        </Typography>
      </Box>

      {/* Timeline Footer (Placeholder) */}
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
