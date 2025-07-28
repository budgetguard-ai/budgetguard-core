import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Chip,
  Paper,
  TextField,
  InputAdornment,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  ContentCopy as CopyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
import {
  useTenantApiKeys,
  useCreateTenantApiKey,
  useDeleteApiKey,
} from "../../hooks/useApi";
import type { Tenant } from "../../types";

interface ManageApiKeysDialogProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
}

const ManageApiKeysDialog: React.FC<ManageApiKeysDialogProps> = ({
  open,
  tenant,
  onClose,
}) => {
  const [showKeys, setShowKeys] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<number | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{
    id: number;
    key: string;
  } | null>(null);

  const {
    data: apiKeys = [],
    isLoading: loadingKeys,
    error: keysError,
  } = useTenantApiKeys(tenant?.id || 0);

  const createApiKeyMutation = useCreateTenantApiKey();
  const deleteApiKeyMutation = useDeleteApiKey();

  const handleCreateApiKey = async () => {
    if (!tenant) return;

    try {
      const newApiKey = await createApiKeyMutation.mutateAsync(tenant.id);
      // Show the newly created key to the user
      setNewlyCreatedKey({ id: newApiKey.id, key: newApiKey.key || "" });
      // Auto-show the new key
      setShowKeys((prev) => ({ ...prev, [newApiKey.id]: true }));
    } catch (error) {
      console.error("Failed to create API key:", error);
    }
  };

  const handleDeleteApiKey = async (keyId: number) => {
    try {
      await deleteApiKeyMutation.mutateAsync(keyId);
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  };

  const handleCopyKey = async (keyId: number, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      console.error("Failed to copy key:", error);
    }
  };

  const toggleKeyVisibility = (keyId: number) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const formatKey = (key: string, keyId: number) => {
    if (showKeys[keyId]) {
      return key;
    }
    return `${key.substring(0, 8)}${"•".repeat(32)}`;
  };

  const formatLastUsed = (lastUsedAt: string | null) => {
    if (!lastUsedAt) return "Never";

    const date = new Date(lastUsedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  if (!tenant) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="h6">API Keys for {tenant.name}</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleCreateApiKey}
            disabled={createApiKeyMutation.isPending}
          >
            {createApiKeyMutation.isPending ? "Creating..." : "New API Key"}
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent>
        {keysError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load API keys: {keysError.message}
          </Alert>
        )}

        {createApiKeyMutation.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to create API key: {createApiKeyMutation.error.message}
          </Alert>
        )}

        {newlyCreatedKey && (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
              🎉 API Key Created Successfully!
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Important:</strong> This is the only time you'll see this
              key. Please copy and store it securely.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
              <TextField
                value={newlyCreatedKey.key}
                InputProps={{
                  readOnly: true,
                  sx: {
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                    "& input": {
                      cursor: "text",
                      userSelect: "all",
                    },
                  },
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip
                        title={
                          copiedKey === newlyCreatedKey.id
                            ? "Copied!"
                            : "Copy key"
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() =>
                            handleCopyKey(
                              newlyCreatedKey.id,
                              newlyCreatedKey.key,
                            )
                          }
                          color={
                            copiedKey === newlyCreatedKey.id
                              ? "success"
                              : "primary"
                          }
                        >
                          <CopyIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                size="small"
                fullWidth
              />
            </Box>
            <Button
              size="small"
              onClick={() => setNewlyCreatedKey(null)}
              sx={{ mt: 1 }}
            >
              Dismiss
            </Button>
          </Alert>
        )}

        {deleteApiKeyMutation.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to delete API key: {deleteApiKeyMutation.error.message}
          </Alert>
        )}

        {loadingKeys ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : apiKeys.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              No API keys found for this tenant.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create an API key to allow this tenant to access the API.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>API Key</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Last Used</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      >
                        <TextField
                          value={
                            apiKey.key
                              ? formatKey(apiKey.key, apiKey.id)
                              : "••••••••••••••••••••••••••••••••••••••••"
                          }
                          InputProps={{
                            readOnly: true,
                            sx: {
                              fontFamily: "monospace",
                              fontSize: "0.875rem",
                              "& input": {
                                cursor: "text",
                                userSelect: "all",
                              },
                            },
                            endAdornment: apiKey.key && (
                              <InputAdornment position="end">
                                <Tooltip
                                  title={
                                    showKeys[apiKey.id]
                                      ? "Hide key"
                                      : "Show key"
                                  }
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      toggleKeyVisibility(apiKey.id)
                                    }
                                  >
                                    {showKeys[apiKey.id] ? (
                                      <VisibilityOffIcon />
                                    ) : (
                                      <VisibilityIcon />
                                    )}
                                  </IconButton>
                                </Tooltip>
                                {showKeys[apiKey.id] && (
                                  <Tooltip
                                    title={
                                      copiedKey === apiKey.id
                                        ? "Copied!"
                                        : "Copy key"
                                    }
                                  >
                                    <IconButton
                                      size="small"
                                      onClick={() =>
                                        handleCopyKey(apiKey.id, apiKey.key!)
                                      }
                                      color={
                                        copiedKey === apiKey.id
                                          ? "success"
                                          : "default"
                                      }
                                    >
                                      <CopyIcon />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </InputAdornment>
                            ),
                          }}
                          size="small"
                          fullWidth
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={apiKey.isActive ? "Active" : "Inactive"}
                        size="small"
                        color={apiKey.isActive ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(apiKey.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{formatLastUsed(apiKey.lastUsedAt)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete API Key">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteApiKey(apiKey.id)}
                          disabled={deleteApiKeyMutation.isPending}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Important:</strong> API keys are only shown in full when
            first created. Make sure to copy and store them securely as they
            cannot be retrieved again.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManageApiKeysDialog;
