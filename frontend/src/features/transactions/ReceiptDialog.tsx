import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useFeedback } from '@/components/common/FeedbackProvider';
import { transactionsApi } from '@/services/endpoints';
import { invalidateFinancialData } from '@/utils/invalidate';
import type { Transaction } from '@/types';
import { formatDateTime } from '@/utils/format';

interface ReceiptDialogProps {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
}

export function ReceiptDialog({ open, transaction, onClose }: ReceiptDialogProps) {
  const queryClient = useQueryClient();
  const { notify } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      transactionsApi.deleteAttachment(transaction!.id, attachmentId),
    onSuccess: async () => {
      notify('Receipt removed');
      await invalidateFinancialData(queryClient);
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const handleUpload = async (file: File | null) => {
    if (!file || !transaction) return;
    setError(null);
    setUploading(true);
    try {
      await transactionsApi.uploadAttachment(transaction.id, file);
      notify('Receipt uploaded');
      await invalidateFinancialData(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Receipts & documents</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {transaction?.description} · PDF, PNG, JPEG or WEBP up to 10 MB.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {transaction?.attachments.length ? (
          <List dense disablePadding>
            {transaction.attachments.map((attachment) => (
              <ListItem
                key={attachment.id}
                secondaryAction={
                  <Stack direction="row">
                    <IconButton
                      size="small"
                      aria-label="Download"
                      onClick={() =>
                        void transactionsApi
                          .downloadAttachment(transaction.id, attachment.id, attachment.filename)
                          .catch(() => notify('Download failed', 'error'))
                      }
                    >
                      <DownloadRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Delete"
                      color="error"
                      onClick={() => deleteMutation.mutate(attachment.id)}
                    >
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemText
                  primary={
                    <Link component="button" variant="body2" onClick={() => void transactionsApi.downloadAttachment(transaction.id, attachment.id, attachment.filename)}>
                      {attachment.filename}
                    </Link>
                  }
                  secondary={`${(attachment.size_bytes / 1024).toFixed(0)} KB · ${formatDateTime(attachment.created_at)}`}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <AttachFileRoundedIcon sx={{ fontSize: 34, mb: 1 }} />
            <Typography variant="body2">No receipts attached yet.</Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />
        <Button component="label" variant="outlined" startIcon={<AttachFileRoundedIcon />} disabled={uploading || !transaction}>
          {uploading ? 'Uploading…' : 'Add receipt'}
          <input
            hidden
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(event) => {
              void handleUpload(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
