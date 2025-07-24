import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Typography,
  Box,
  TextField,
} from "@mui/material";
import { useDeleteTenant } from "../../hooks/useApi";
import type { Tenant } from "../../types";

interface DeleteConfirmationDialogProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
}

const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  tenant,
  onClose,
}) => {
  const [confirmationText, setConfirmationText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const deleteTenantMutation = useDeleteTenant();

  const handleDelete = async () => {
    if (!tenant) return;

    setLocalError(null);

    if (confirmationText !== tenant.name) {
      setLocalError("Confirmation text does not match tenant name");
      return;
    }

    try {
      await deleteTenantMutation.mutateAsync(tenant.id);
      handleClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleClose = () => {
    setConfirmationText("");
    setLocalError(null);
    deleteTenantMutation.reset();
    onClose();
  };

  const error = localError || deleteTenantMutation.error?.message;
  const isConfirmationValid = confirmationText === tenant?.name;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: "error.main" }}>Delete Tenant</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. All data associated with this tenant
            will be permanently deleted.
          </Alert>

          <Typography variant="body1" sx={{ mb: 2 }}>
            You are about to delete the tenant <strong>{tenant?.name}</strong>.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will permanently delete:
          </Typography>

          <Box component="ul" sx={{ mb: 2, pl: 2 }}>
            <Typography component="li" variant="body2" color="text.secondary">
              All API keys for this tenant
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All budget configurations
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All usage history and audit logs
            </Typography>
            <Typography component="li" variant="body2" color="text.secondary">
              All cached data and rate limits
            </Typography>
          </Box>

          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{tenant?.name}</strong> to confirm deletion:
          </Typography>

          <TextField
            fullWidth
            variant="outlined"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={tenant?.name || ""}
            disabled={deleteTenantMutation.isPending}
            error={!!localError && confirmationText !== tenant?.name}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={deleteTenantMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant="contained"
          color="error"
          disabled={deleteTenantMutation.isPending || !isConfirmationValid}
        >
          {deleteTenantMutation.isPending ? "Deleting..." : "Delete Tenant"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmationDialog;
