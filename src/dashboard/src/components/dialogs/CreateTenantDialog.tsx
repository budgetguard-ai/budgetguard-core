import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
} from "@mui/material";
import { useCreateTenant } from "../../hooks/useApi";
import type { CreateTenantRequest } from "../../types";

interface CreateTenantDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreateTenantDialog: React.FC<CreateTenantDialogProps> = ({
  open,
  onClose,
}) => {
  const [formData, setFormData] = useState<CreateTenantRequest>({
    name: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const createTenantMutation = useCreateTenant();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!formData.name.trim()) {
      setLocalError("Tenant name is required");
      return;
    }

    try {
      await createTenantMutation.mutateAsync(formData);
      handleClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleClose = () => {
    setFormData({ name: "" });
    setLocalError(null);
    createTenantMutation.reset();
    onClose();
  };

  const error = localError || createTenantMutation.error?.message;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create New Tenant</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <TextField
              autoFocus
              label="Tenant Name"
              fullWidth
              variant="outlined"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              error={!!localError && !formData.name.trim()}
              helperText={
                !!localError && !formData.name.trim()
                  ? "Tenant name is required"
                  : "Enter a unique name for the tenant"
              }
              disabled={createTenantMutation.isPending}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleClose}
            disabled={createTenantMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createTenantMutation.isPending || !formData.name.trim()}
          >
            {createTenantMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateTenantDialog;
