import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Box
} from '@mui/material';

interface PermissionHelperProps {
  open: boolean;
  onClose: () => void;
}

function PermissionHelper({ open, onClose }: PermissionHelperProps) {
  const isMac = navigator.platform.toLowerCase().includes('mac');

  if (!isMac) {
    // Windows doesn't need permission setup
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Screen Recording Permission Required</DialogTitle>

      <DialogContent>
        <Typography variant="body2" paragraph>
          ClipForge needs permission to record your screen. Follow these steps:
        </Typography>

        <Stepper orientation="vertical">
          <Step active>
            <StepLabel>Open System Preferences</StepLabel>
            <StepContent>
              <Typography variant="body2">
                Click the Apple menu → System Preferences (or System Settings)
              </Typography>
            </StepContent>
          </Step>

          <Step active>
            <StepLabel>Navigate to Privacy</StepLabel>
            <StepContent>
              <Typography variant="body2">
                Go to Security & Privacy → Privacy tab
              </Typography>
            </StepContent>
          </Step>

          <Step active>
            <StepLabel>Enable Screen Recording</StepLabel>
            <StepContent>
              <Typography variant="body2">
                1. Select "Screen Recording" from the left sidebar<br />
                2. Click the lock icon to make changes<br />
                3. Check the box next to "ClipForge"<br />
                4. Restart ClipForge
              </Typography>
            </StepContent>
          </Step>
        </Stepper>

        <Box sx={{ mt: 3, p: 2, backgroundColor: 'background.default', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Note:</strong> You only need to do this once. After granting permission, restart ClipForge for changes to take effect.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Got It</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PermissionHelper;
