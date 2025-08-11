import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import { apiClient } from "../services/api";
import { useDashboardStore } from "../hooks/useStore";
import TagCreateDialog from "../components/forms/TagCreateDialog";
import TagEditDialog from "../components/forms/TagEditDialog";
import TagBudgetManagementDialog from "../components/forms/TagBudgetManagementDialog";
import UnifiedTagTable from "../components/tag/UnifiedTagTable";
import type { Tenant, Tag, TagBudget } from "../types";

const TagManagement: React.FC = () => {
  const { selectedTenant, setSelectedTenant } = useDashboardStore();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagBudgets, setTagBudgets] = useState<TagBudget[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [createTagDialogOpen, setCreateTagDialogOpen] = useState(false);
  const [selectedParentForCreate, setSelectedParentForCreate] =
    useState<Tag | null>(null);
  const [budgetManagementDialogOpen, setBudgetManagementDialogOpen] =
    useState(false);
  const [selectedTagForBudget, setSelectedTagForBudget] = useState<Tag | null>(
    null,
  );
  const [editTagDialogOpen, setEditTagDialogOpen] = useState(false);
  const [selectedTagForEdit, setSelectedTagForEdit] = useState<Tag | null>(
    null,
  );

  // Fetch tenants on component mount
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const fetchedTenants = await apiClient.getTenants();
        setTenants(fetchedTenants);

        // Auto-select first tenant if none selected
        if (!selectedTenant && fetchedTenants.length > 0) {
          setSelectedTenant(fetchedTenants[0]);
        }
      } catch (error) {
        console.error("Failed to fetch tenants:", error);
      } finally {
        setTenantsLoading(false);
      }
    };

    void fetchTenants();
  }, [selectedTenant, setSelectedTenant]);

  // Fetch tags and budgets when tenant changes
  useEffect(() => {
    if (!selectedTenant) {
      setTags([]);
      setTagBudgets([]);
      return;
    }

    console.log(
      "Fetching tag data for tenant:",
      selectedTenant.name,
      selectedTenant.id,
    );

    const fetchTagData = async () => {
      setIsLoading(true);
      setTags([]); // Clear existing data immediately
      setTagBudgets([]);

      try {
        const [fetchedTags, fetchedBudgets] = await Promise.all([
          apiClient.getTenantTags(selectedTenant.id, true), // Include inactive tags
          apiClient.getTagBudgets(selectedTenant.id),
        ]);

        console.log("Fetched tags:", fetchedTags.length);
        console.log("Fetched budgets:", fetchedBudgets.length);

        setTags(fetchedTags);
        setTagBudgets(fetchedBudgets);
      } catch (error) {
        console.error("Failed to fetch tag data:", error);
        setTags([]);
        setTagBudgets([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTagData();
  }, [selectedTenant]);

  const handleTagCreated = (newTag: Tag) => {
    setTags((prev) => [...prev, newTag]);
    setSelectedParentForCreate(null);
  };

  const handleEditTag = (tag: Tag) => {
    setSelectedTagForEdit(tag);
    setEditTagDialogOpen(true);
  };

  const handleTagEdited = (updatedTag: Tag) => {
    // Update the local state with the already-saved tag from the dialog
    setTags((prev) =>
      prev.map((t) => (t.id === updatedTag.id ? updatedTag : t)),
    );
    setEditTagDialogOpen(false);
    setSelectedTagForEdit(null);
  };

  const handleDeleteTag = async (tag: Tag) => {
    if (!selectedTenant) return;

    // TODO: Add confirmation dialog
    try {
      await apiClient.deleteTag(selectedTenant.id, tag.id);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch (error) {
      console.error("Failed to delete tag:", error);
    }
  };

  const handleToggleActive = async (tag: Tag) => {
    if (!selectedTenant) return;

    try {
      const updatedTag = await apiClient.updateTag(selectedTenant.id, tag.id, {
        isActive: !tag.isActive,
      });
      setTags((prev) => prev.map((t) => (t.id === tag.id ? updatedTag : t)));
    } catch (error) {
      console.error("Failed to toggle tag status:", error);
    }
  };

  const handleCreateChild = (parentTag: Tag) => {
    setSelectedParentForCreate(parentTag);
    setCreateTagDialogOpen(true);
  };

  const handleCreateBudget = (tag: Tag) => {
    setSelectedTagForBudget(tag);
    setBudgetManagementDialogOpen(true);
  };

  const handleBudgetCreated = (newBudget: TagBudget) => {
    setTagBudgets((prev) => [...prev, newBudget]);
  };

  const handleBudgetUpdated = (updatedBudget: TagBudget) => {
    setTagBudgets((prev) =>
      prev.map((budget) =>
        budget.id === updatedBudget.id ? updatedBudget : budget,
      ),
    );
  };

  const handleBudgetDeleted = (budgetId: number) => {
    setTagBudgets((prev) => prev.filter((budget) => budget.id !== budgetId));
  };

  if (tenantsLoading) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tag Management
        </Typography>
        <Alert severity="info">Loading tenants...</Alert>
      </Box>
    );
  }

  if (!selectedTenant) {
    return (
      <Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 600, mb: 3 }}
        >
          Tag Management
        </Typography>
        <Alert severity="info">Please select a tenant to manage tags.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          Tag Management
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Select Tenant</InputLabel>
            <Select
              value={selectedTenant?.id || ""}
              label="Select Tenant"
              onChange={(e) => {
                const tenant = tenants.find(
                  (t) => t.id === Number(e.target.value),
                );
                setSelectedTenant(tenant || null);
              }}
            >
              {tenants.map((tenant) => (
                <MenuItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Header Actions */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          size="small"
          onClick={() => setCreateTagDialogOpen(true)}
        >
          Create Tag
        </Button>
      </Box>

      {/* Full Width Tag Management Table */}
      {isLoading ? (
        <Alert severity="info">Loading tags and budgets...</Alert>
      ) : (
        <UnifiedTagTable
          tags={tags}
          budgets={tagBudgets}
          onEditTag={handleEditTag}
          onDeleteTag={handleDeleteTag}
          onToggleTagActive={handleToggleActive}
          onCreateChild={handleCreateChild}
          onCreateBudget={handleCreateBudget}
        />
      )}

      {/* Tag Creation Dialog */}
      {selectedTenant && (
        <TagCreateDialog
          open={createTagDialogOpen}
          onClose={() => {
            setCreateTagDialogOpen(false);
            setSelectedParentForCreate(null);
          }}
          onSuccess={handleTagCreated}
          tenantId={selectedTenant.id}
          existingTags={tags}
          preselectedParent={selectedParentForCreate}
        />
      )}

      {/* Tag Edit Dialog */}
      {selectedTenant && selectedTagForEdit && (
        <TagEditDialog
          open={editTagDialogOpen}
          onClose={() => {
            setEditTagDialogOpen(false);
            setSelectedTagForEdit(null);
          }}
          onSuccess={handleTagEdited}
          tenantId={selectedTenant.id}
          existingTags={tags}
          tagToEdit={selectedTagForEdit}
        />
      )}

      {/* Tag Budget Management Dialog */}
      {selectedTenant && selectedTagForBudget && (
        <TagBudgetManagementDialog
          open={budgetManagementDialogOpen}
          onClose={() => {
            setBudgetManagementDialogOpen(false);
            setSelectedTagForBudget(null);
          }}
          onSuccess={handleBudgetCreated}
          onBudgetUpdate={handleBudgetUpdated}
          onBudgetDelete={handleBudgetDeleted}
          tenantId={selectedTenant.id}
          selectedTag={selectedTagForBudget}
          existingBudgets={tagBudgets}
        />
      )}
    </Box>
  );
};

export default TagManagement;
