import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  FiberManualRecord,
  Stop,
  Videocam,
  DesktopWindows,
  Mic,
  MicOff
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { useVideoStore } from '../store/videoStore';
import { useRecordingResolution } from '../hooks/useRecordingResolution';
import PermissionHelper from './PermissionHelper';
import CameraPreview from './CameraPreview';
import ScreenPreview from './ScreenPreview';
import ResolutionSelector from './ResolutionSelector';

interface RecordingDialogProps {
  open: boolean;
  onClose: () => void;
}

type RecordingSource = 'screen' | 'camera';

function RecordingDialog({ open, onClose }: RecordingDialogProps) {
  const [source, setSource] = useState<RecordingSource>('screen');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionHelper, setShowPermissionHelper] = useState(false);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [isWindows, setIsWindows] = useState(false);
  const [enableMicrophone, setEnableMicrophone] = useState(false);

  const addClip = useVideoStore((state) => state.addClip);
  const selectedResolution = useVideoStore((state) => state.selectedResolution);
  const setSelectedResolution = useVideoStore((state) => state.setSelectedResolution);
  const setScreenSourceResolution = useVideoStore((state) => state.setScreenSourceResolution);
  const setCameraSourceResolution = useVideoStore((state) => state.setCameraSourceResolution);

  const { sourceResolution: screenResolution } = useRecordingResolution('screen');
  const { sourceResolution: cameraResolution } = useRecordingResolution('camera');

  // Detect platform and fetch devices
  useEffect(() => {
    const detectPlatform = async () => {
      try {
        // Detect if we're on Windows
        const platform = navigator.platform.toLowerCase();
        setIsWindows(platform.includes('win'));
      } catch (err) {
        console.error('Failed to detect platform:', err);
      }
    };

    detectPlatform();
  }, []);

  // Fetch available audio/video devices when dialog opens (for both camera and screen with mic)
  useEffect(() => {
    if (!open) return;

    // Only fetch for Windows (it needs device selection)
    // For camera: always fetch
    // For screen: only fetch if microphone is enabled
    const shouldFetch = isWindows && (source === 'camera' || (source === 'screen' && enableMicrophone));
    if (!shouldFetch) return;

    const fetchDevices = async () => {
      try {
        const devices = await invoke<{ video_devices: string[], audio_devices: string[] }>(
          'list_audio_video_devices'
        );
        setAudioDevices(devices.audio_devices);
        // Auto-select first device if available
        if (devices.audio_devices.length > 0 && !selectedAudioDevice) {
          setSelectedAudioDevice(devices.audio_devices[0]);
        }
      } catch (err) {
        console.error('Failed to fetch devices:', err);
      }
    };

    fetchDevices();
  }, [open, source, isWindows, enableMicrophone]);

  // Update store when resolutions are loaded
  useEffect(() => {
    if (screenResolution) {
      setScreenSourceResolution(screenResolution);
    }
  }, [screenResolution, setScreenSourceResolution]);

  useEffect(() => {
    if (cameraResolution) {
      setCameraSourceResolution(cameraResolution);
    }
  }, [cameraResolution, setCameraSourceResolution]);

  // Timer for recording duration
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const handleStartRecording = async () => {
    setError(null);

    try {
      // Generate temporary file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const tempPath = `/tmp/${source}-recording-${timestamp}.mp4`;
      setOutputPath(tempPath);

      // Prepare recording options
      const recordingOptions: any = {
        resolution: selectedResolution,
        source_width: source === 'screen' ? screenResolution?.width : cameraResolution?.width,
        source_height: source === 'screen' ? screenResolution?.height : cameraResolution?.height,
      };

      // Add audio device for camera recording on Windows
      if (source === 'camera' && isWindows && selectedAudioDevice) {
        recordingOptions.audio_device = selectedAudioDevice;
      }

      // Add audio device for screen recording with microphone enabled
      if (source === 'screen' && enableMicrophone) {
        // For Windows, use the selected device; for macOS, just indicate we want audio (will use default)
        recordingOptions.audio_device = isWindows ? selectedAudioDevice : 'default';
      }

      // Start recording based on source
      if (source === 'screen') {
        await invoke('start_screen_recording', {
          outputPath: tempPath,
          options: recordingOptions
        });
      } else {
        await invoke('start_camera_recording', {
          outputPath: tempPath,
          options: recordingOptions
        });
      }

      setIsRecording(true);
      setRecordingTime(0);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError(err.toString());
    }
  };

  // Stop recording
  const handleStopRecording = async () => {
    try {
      // Stop the recording
      if (source === 'screen') {
        await invoke('stop_screen_recording');
      } else {
        await invoke('stop_camera_recording');
      }

      setIsRecording(false);

      // Now prompt for save location
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const defaultName = `${source}-recording-${timestamp}.mp4`;

      const savePath = await invoke<string>('save_file_dialog', {
        defaultFilename: defaultName
      });

      if (!savePath) {
        // User cancelled - delete temp file
        if (outputPath) {
          await invoke('delete_file', { path: outputPath }).catch(() => {
            console.warn('Failed to delete temporary file');
          });
        }
        onClose();
        resetState();
        return;
      }

      const finalPath = savePath.endsWith('.mp4') ? savePath : `${savePath}.mp4`;

      // Move the temp file to the final location
      if (outputPath) {
        await invoke('move_file', { from: outputPath, to: finalPath });

        // Auto-import the recording
        const fileName = finalPath.split('/').pop() || finalPath.split('\\').pop() || 'recording.mp4';
        addClip(finalPath, fileName);
      }

      // Close dialog
      onClose();
      resetState();

    } catch (err: any) {
      console.error('Failed to stop recording:', err);
      setError(err.toString());
      setIsRecording(false);
    }
  };

  // Reset state
  const resetState = () => {
    setIsRecording(false);
    setRecordingTime(0);
    setOutputPath(null);
    setError(null);
    setSource('screen');
  };

  // Cleanup on close
  const handleClose = () => {
    if (!isRecording) {
      resetState();
      onClose();
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Record Video</DialogTitle>

        <DialogContent>
          {!isRecording ? (
            <Box>
              {/* Source Selection */}
              <Typography variant="subtitle2" gutterBottom>
                Choose recording source:
              </Typography>
              <ToggleButtonGroup
                value={source}
                exclusive
                onChange={(_, newSource) => {
                  if (newSource) setSource(newSource);
                }}
                fullWidth
                sx={{ mb: 3 }}
              >
                <ToggleButton value="screen">
                  <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
                    <DesktopWindows />
                    <Typography variant="caption">Screen</Typography>
                  </Stack>
                </ToggleButton>
                <ToggleButton value="camera">
                  <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
                    <Videocam />
                    <Typography variant="caption">Camera</Typography>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>

              {/* Camera Preview */}
              {source === 'camera' && (
                <CameraPreview isActive={true} isRecording={false} />
              )}

              {/* Screen Preview */}
              {source === 'screen' && (
                <ScreenPreview isActive={true} isRecording={false} />
              )}

              {/* Microphone Enable (Screen source) */}
              {source === 'screen' && (
                <Box sx={{ mb: 2, mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Tooltip title={enableMicrophone ? 'Disable Microphone' : 'Enable Microphone'}>
                    <IconButton
                      onClick={() => setEnableMicrophone(!enableMicrophone)}
                      color={enableMicrophone ? 'primary' : 'default'}
                      sx={{
                        border: enableMicrophone ? 2 : 1,
                        borderColor: enableMicrophone ? 'primary.main' : 'divider'
                      }}
                    >
                      {enableMicrophone ? <Mic /> : <MicOff />}
                    </IconButton>
                  </Tooltip>
                  <Typography variant="body2" color={enableMicrophone ? 'text.primary' : 'text.secondary'}>
                    {enableMicrophone ? 'Recording Microphone Audio' : 'No Microphone Audio'}
                  </Typography>
                </Box>
              )}

              {/* Microphone Selection (Windows only, Screen source with mic enabled) */}
              {source === 'screen' && isWindows && enableMicrophone && audioDevices.length > 0 && (
                <Box sx={{ mb: 3, mt: 1 }}>
                  <FormControl fullWidth>
                    <InputLabel id="screen-microphone-select-label">Microphone</InputLabel>
                    <Select
                      labelId="screen-microphone-select-label"
                      id="screen-microphone-select"
                      value={selectedAudioDevice}
                      label="Microphone"
                      onChange={(e) => setSelectedAudioDevice(e.target.value)}
                    >
                      {audioDevices.map((device) => (
                        <MenuItem key={device} value={device}>
                          {device}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Microphone Selection (Windows only, Camera source only) */}
              {source === 'camera' && isWindows && audioDevices.length > 0 && (
                <Box sx={{ mb: 3, mt: 3 }}>
                  <FormControl fullWidth>
                    <InputLabel id="microphone-select-label">Microphone</InputLabel>
                    <Select
                      labelId="microphone-select-label"
                      id="microphone-select"
                      value={selectedAudioDevice}
                      label="Microphone"
                      onChange={(e) => setSelectedAudioDevice(e.target.value)}
                    >
                      {audioDevices.map((device) => (
                        <MenuItem key={device} value={device}>
                          {device}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              )}

              {/* Resolution Selector */}
              <Box sx={{ mb: 3, mt: 3 }}>
                <ResolutionSelector
                  value={selectedResolution}
                  onChange={setSelectedResolution}
                  source={source}
                  sourceResolution={
                    source === 'screen' ? (screenResolution || undefined) : (cameraResolution || undefined)
                  }
                />
              </Box>

              {/* Permission Notices */}
              {source === 'screen' && (
                <Alert
                  severity="info"
                  sx={{ mb: 2 }}
                  action={
                    <Button size="small" onClick={() => setShowPermissionHelper(true)}>
                      Help
                    </Button>
                  }
                >
                  <Typography variant="body2">
                    <strong>First time?</strong> You'll need to grant screen recording permission.
                  </Typography>
                </Alert>
              )}

              {source === 'camera' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>First time?</strong> You'll need to grant camera permission.
                  </Typography>
                </Alert>
              )}

              {/* Error Display */}
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              {/* Camera Preview During Recording */}
              {source === 'camera' && (
                <Box sx={{ mb: 2 }}>
                  <CameraPreview isActive={true} isRecording={true} />
                </Box>
              )}

              {/* Screen Preview During Recording */}
              {source === 'screen' && (
                <Box sx={{ mb: 2 }}>
                  <ScreenPreview isActive={true} isRecording={true} />
                </Box>
              )}

              {/* Recording Indicator */}
              <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
                <CircularProgress
                  size={80}
                  thickness={2}
                  sx={{
                    color: 'error.main',
                    animation: 'pulse 2s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.5 }
                    }
                  }}
                />
                <Box sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FiberManualRecord sx={{ fontSize: 32, color: 'error.main' }} />
                </Box>
              </Box>

              <Typography variant="h4" gutterBottom>
                {formatTime(recordingTime)}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Recording {source}...
              </Typography>

              {outputPath && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, wordBreak: 'break-all' }}>
                  Saving to: {outputPath}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          {!isRecording ? (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleStartRecording}
                variant="contained"
                startIcon={<FiberManualRecord />}
                color="error"
              >
                Start Recording
              </Button>
            </>
          ) : (
            <Button
              onClick={handleStopRecording}
              variant="contained"
              startIcon={<Stop />}
              fullWidth
            >
              Stop Recording
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <PermissionHelper
        open={showPermissionHelper}
        onClose={() => setShowPermissionHelper(false)}
      />
    </>
  );
}

export default RecordingDialog;
