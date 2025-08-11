import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { ColorPicker } from "../common/ColorPicker";
import { apiClient } from "../../services/api";
import type { Tag, UpdateTagRequest } from "../../types";

interface TagEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (tag: Tag) => void;
  tenantId: number;
  existingTags: Tag[];
  tagToEdit: Tag | null;
}

const TagEditDialog: React.FC<TagEditDialogProps> = ({
  open,
  onClose,
  onSuccess,
  tenantId,
  existingTags,
  tagToEdit,
}) => {
  const [formData, setFormData] = useState<UpdateTagRequest>({
    name: "",
    description: "",
    color: "#1976d2",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form data when dialog opens with a new tag
  useEffect(() => {
    if (tagToEdit) {
      setFormData({
        name: tagToEdit.name,
        description: tagToEdit.description || "",
        color: tagToEdit.color || "#1976d2",
      });
    }
    setError(null);
  }, [tagToEdit, open]);

  // Get siblings and self for name validation (exclude current tag)
  const siblingsAndSelf = existingTags.filter(
    (tag) => tag.parentId === tagToEdit?.parentId && tag.id !== tagToEdit?.id,
  );

  const handleInputChange = (
    field: keyof UpdateTagRequest,
    value: string | undefined,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const validateForm = () => {
    const trimmedName = formData.name?.trim() || "";

    if (!trimmedName) {
      setError("Tag name is required");
      return false;
    }

    // Check for duplicate names (case-insensitive with Unicode normalization)
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      usage: "search",
    });
    const nameExists = siblingsAndSelf.some(
      (tag) => collator.compare(tag.name, trimmedName) === 0,
    );

    if (nameExists) {
      setError("A tag with this name already exists at the same level");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!tagToEdit || !validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const updatedTag = await apiClient.updateTag(tenantId, tagToEdit.id, {
        ...formData,
        name: formData.name?.trim(),
      });

      onSuccess(updatedTag);
      onClose();
    } catch (err) {
      console.error("Failed to update tag:", err);
      setError("Failed to update tag. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { minHeight: 400 } }}
    >
      <DialogTitle>Edit Tag</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Tag Name"
            value={formData.name || ""}
            onChange={(e) => handleInputChange("name", e.target.value)}
            fullWidth
            required
            disabled={isSubmitting}
          />

          <TextField
            label="Description"
            value={formData.description || ""}
            onChange={(e) => handleInputChange("description", e.target.value)}
            fullWidth
            multiline
            rows={3}
            disabled={isSubmitting}
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Color
            </Typography>
            <ColorPicker
              color={formData.color || "#1976d2"}
              onChange={(color) => handleInputChange("color", color)}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
          startIcon={
            isSubmitting ? <CircularProgress size={20} color="inherit" /> : null
          }
        >
          {isSubmitting ? "Updating..." : "Update Tag"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagEditDialog;
