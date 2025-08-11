import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { ColorPicker } from "../common/ColorPicker";
import { apiClient } from "../../services/api";
import type { Tag, CreateTagRequest } from "../../types";

interface TagCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (tag: Tag) => void;
  tenantId: number;
  existingTags: Tag[];
  preselectedParent?: Tag | null;
}

const TagCreateDialog: React.FC<TagCreateDialogProps> = ({
  open,
  onClose,
  onSuccess,
  tenantId,
  existingTags,
  preselectedParent = null,
}) => {
  const [formData, setFormData] = useState<CreateTagRequest>({
    name: "",
    description: "",
    color: "#1976d2",
    parentId: preselectedParent?.id,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get potential parent tags (active tags only)
  const potentialParents = existingTags.filter((tag) => tag.isActive);

  const handleInputChange = (
    field: keyof CreateTagRequest,
    value: string | number | undefined,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Tag name is required");
      return;
    }

    // Check for duplicate names at the same hierarchy level
    const selectedParentId = formData.parentId;
    const siblingsAndSelf = existingTags.filter(
      (tag) => tag.parentId === selectedParentId,
    );
    // Check for duplicate names (case-insensitive with Unicode normalization)
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      usage: "search",
    });
    const nameExists = siblingsAndSelf.some(
      (tag) => collator.compare(tag.name, formData.name.trim()) === 0,
    );

    if (nameExists) {
      setError(`Tag name "${formData.name}" already exists at this level`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTag = await apiClient.createTag(tenantId, {
        ...formData,
        name: formData.name.trim(),
      });

      onSuccess(newTag);
      handleClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create tag";
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        name: "",
        description: "",
        color: "#1976d2",
        parentId: preselectedParent?.id,
      });
      setError(null);
      onClose();
    }
  };

  // Reset form when dialog opens with new parent
  React.useEffect(() => {
    if (open) {
      setFormData({
        name: "",
        description: "",
        color: "#1976d2",
        parentId: preselectedParent?.id,
      });
      setError(null);
    }
  }, [open, preselectedParent]);

  const getParentPath = (parentId: number | undefined): string => {
    if (!parentId) return "";
    const parent = existingTags.find((tag) => tag.id === parentId);
    return parent ? parent.path || parent.name : "";
  };

  const generatePreviewPath = (): string => {
    const parentPath = getParentPath(formData.parentId);
    const tagName = formData.name.trim() || "[tag-name]";
    return parentPath ? `${parentPath}/${tagName}` : tagName;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Tag</DialogTitle>

      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            label="Tag Name"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            required
            fullWidth
            placeholder="e.g., production, api, frontend"
            helperText="Use descriptive names like 'production', 'api-v1', or 'frontend-team'"
          />

          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description for this tag..."
          />

          <FormControl fullWidth>
            <InputLabel>Parent Tag (Optional)</InputLabel>
            <Select
              value={formData.parentId || ""}
              label="Parent Tag (Optional)"
              onChange={(e) =>
                handleInputChange(
                  "parentId",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            >
              <MenuItem value="">
                <em>No parent (root tag)</em>
              </MenuItem>
              {potentialParents.map((tag) => (
                <MenuItem key={tag.id} value={tag.id}>
                  {tag.path || tag.name} - {tag.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Tag Color
            </Typography>
            <ColorPicker
              color={formData.color || "#1976d2"}
              onChange={(color) => handleInputChange("color", color)}
            />
          </Box>

          <Box
            sx={{
              p: 2,
              backgroundColor: "action.hover",
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Preview Path:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontFamily: "monospace",
                color: "primary.main",
                fontWeight: 500,
              }}
            >
              {generatePreviewPath()}
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || !formData.name.trim()}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? "Creating..." : "Create Tag"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagCreateDialog;
