import { useState } from 'react';
import { Button } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import RecordingDialog from './RecordingDialog';

function RecordButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        color="inherit"
        startIcon={<FiberManualRecord />}
        onClick={() => setDialogOpen(true)}
        sx={{ mr: 2 }}
      >
        Record
      </Button>

      <RecordingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

export default RecordButton;
