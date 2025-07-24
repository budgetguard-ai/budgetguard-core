import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  Box,
  InputAdornment,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { useUpdateTenant } from "../../hooks/useApi";
import type { Tenant, UpdateTenantRequest } from "../../types";

interface EditTenantDialogProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
}

const EditTenantDialog: React.FC<EditTenantDialogProps> = ({
  open,
  tenant,
  onClose,
}) => {
  const [formData, setFormData] = useState<UpdateTenantRequest>({
    name: "",
    rateLimitPerMin: null,
  });
  const [enableRateLimit, setEnableRateLimit] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const updateTenantMutation = useUpdateTenant();

  // Initialize form data when tenant changes
  useEffect(() => {
    if (tenant) {
      setFormData({
        name: tenant.name,
        rateLimitPerMin: tenant.rateLimitPerMin,
      });
      setEnableRateLimit(tenant.rateLimitPerMin !== null);
    }
  }, [tenant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    setLocalError(null);

    if (!formData.name?.trim()) {
      setLocalError("Tenant name is required");
      return;
    }

    const updateData: UpdateTenantRequest = {
      name: formData.name.trim(),
      rateLimitPerMin: enableRateLimit ? formData.rateLimitPerMin || 0 : null,
    };

    try {
      await updateTenantMutation.mutateAsync({
        id: tenant.id,
        data: updateData,
      });
      handleClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleClose = () => {
    setFormData({ name: "", rateLimitPerMin: null });
    setEnableRateLimit(false);
    setLocalError(null);
    updateTenantMutation.reset();
    onClose();
  };

  const error = localError || updateTenantMutation.error?.message;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit Tenant</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              autoFocus
              label="Tenant Name"
              fullWidth
              variant="outlined"
              value={formData.name || ""}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              error={!!localError && !formData.name?.trim()}
              helperText={
                !!localError && !formData.name?.trim()
                  ? "Tenant name is required"
                  : "Enter a unique name for the tenant"
              }
              disabled={updateTenantMutation.isPending}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={enableRateLimit}
                  onChange={(e) => setEnableRateLimit(e.target.checked)}
                  disabled={updateTenantMutation.isPending}
                />
              }
              label="Enable rate limiting"
            />

            {enableRateLimit && (
              <TextField
                label="Rate Limit"
                type="number"
                fullWidth
                variant="outlined"
                value={formData.rateLimitPerMin || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    rateLimitPerMin: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">requests/min</InputAdornment>
                  ),
                }}
                helperText="Maximum requests per minute (0 = unlimited)"
                disabled={updateTenantMutation.isPending}
                inputProps={{ min: 0 }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleClose}
            disabled={updateTenantMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={updateTenantMutation.isPending || !formData.name?.trim()}
          >
            {updateTenantMutation.isPending ? "Updating..." : "Update"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default EditTenantDialog;
