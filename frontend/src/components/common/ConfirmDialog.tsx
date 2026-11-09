import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useEffect, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'primary' | 'error';
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason (recorded in audit history)',
  loading,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: requireReason ? 2 : 0 }}>{description}</DialogContentText>
        {requireReason && (
          <TextField
            label={reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={2}
            autoFocus
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color={tone}
          disabled={loading || (requireReason && reason.trim().length < 3)}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
