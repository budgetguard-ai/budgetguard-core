import React, { useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Tooltip,
  Alert,
  Collapse,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import type { Tag } from "../../types";

interface TagNode extends Tag {
  children: TagNode[];
  level: number;
}

interface TagTreeViewProps {
  tags: Tag[];
  onEditTag: (tag: Tag) => void;
  onDeleteTag: (tag: Tag) => void;
  onToggleActive: (tag: Tag) => void;
  onCreateChild: (parentTag: Tag) => void;
}

const TagTreeView: React.FC<TagTreeViewProps> = ({
  tags,
  onEditTag,
  onDeleteTag,
  onToggleActive,
  onCreateChild,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // Build hierarchical tree structure
  const buildTree = (): TagNode[] => {
    const tagMap = new Map<number, TagNode>();
    const rootNodes: TagNode[] = [];

    // First pass: Create all nodes
    tags.forEach((tag) => {
      tagMap.set(tag.id, {
        ...tag,
        children: [],
        level: 0,
      });
    });

    // Second pass: Build hierarchy
    tags.forEach((tag) => {
      const node = tagMap.get(tag.id)!;

      if (tag.parentId) {
        const parent = tagMap.get(tag.parentId);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    // Sort nodes by name
    const sortNodes = (nodes: TagNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach((node) => sortNodes(node.children));
    };
    sortNodes(rootNodes);

    return rootNodes;
  };

  const treeData = buildTree();

  const handleToggleExpand = (nodeId: number) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, tag: Tag) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedTag(tag);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedTag(null);
  };

  const handleMenuAction = (action: () => void) => {
    action();
    handleMenuClose();
  };

  const renderTagNode = (node: TagNode): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <Box key={node.id}>
        {/* Tag Row */}
        <Card
          variant="outlined"
          sx={{
            mb: 1,
            ml: node.level * 3,
            backgroundColor: node.isActive
              ? "background.paper"
              : "action.disabledBackground",
            opacity: node.isActive ? 1 : 0.7,
          }}
        >
          <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {/* Expand/Collapse Button */}
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => handleToggleExpand(node.id)}
                  sx={{ p: 0.25 }}
                >
                  {isExpanded ? (
                    <ExpandMoreIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </IconButton>
              ) : (
                <Box sx={{ width: 28 }} /> // Spacer
              )}

              {/* Color Indicator */}
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: node.color || "#666",
                  border: "2px solid",
                  borderColor: "divider",
                }}
              />

              {/* Tag Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: node.level === 0 ? 600 : 500,
                      color: node.isActive ? "text.primary" : "text.disabled",
                    }}
                  >
                    {node.name}
                  </Typography>

                  {!node.isActive && (
                    <Chip
                      label="Inactive"
                      size="small"
                      color="default"
                      variant="outlined"
                      sx={{ height: 20, fontSize: "0.6rem" }}
                    />
                  )}

                  <Chip
                    label={`Level ${node.level}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.6rem" }}
                  />
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontFamily: "monospace",
                      backgroundColor: "action.hover",
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.5,
                    }}
                  >
                    {node.path || node.name}
                  </Typography>

                  {node.description && (
                    <Typography variant="caption" color="text.secondary">
                      {node.description}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Actions */}
              <Tooltip title="Actions">
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuClick(e, node)}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </CardContent>
        </Card>

        {/* Children */}
        {hasChildren && (
          <Collapse in={isExpanded}>
            <Box>{node.children.map(renderTagNode)}</Box>
          </Collapse>
        )}
      </Box>
    );
  };

  if (treeData.length === 0) {
    return (
      <Alert severity="info">
        No tags found. Create your first tag to get started with organizing your
        API usage.
      </Alert>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {tags.filter((t) => t.isActive).length} active tags,{" "}
          {tags.filter((t) => !t.isActive).length} inactive
        </Typography>
      </Box>

      <Box>{treeData.map(renderTagNode)}</Box>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 160 },
        }}
      >
        {selectedTag && (
          <>
            <MenuItem
              onClick={() => handleMenuAction(() => onEditTag(selectedTag))}
            >
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Edit Tag
            </MenuItem>

            <MenuItem
              onClick={() => handleMenuAction(() => onCreateChild(selectedTag))}
            >
              <AddIcon fontSize="small" sx={{ mr: 1 }} />
              Add Child Tag
            </MenuItem>

            <MenuItem
              onClick={() =>
                handleMenuAction(() => onToggleActive(selectedTag))
              }
            >
              {selectedTag.isActive ? (
                <>
                  <VisibilityOffIcon fontSize="small" sx={{ mr: 1 }} />
                  Deactivate
                </>
              ) : (
                <>
                  <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
                  Activate
                </>
              )}
            </MenuItem>

            <MenuItem
              onClick={() => handleMenuAction(() => onDeleteTag(selectedTag))}
              sx={{ color: "error.main" }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Delete Tag
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  );
};

export default TagTreeView;
