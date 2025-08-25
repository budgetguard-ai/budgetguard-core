import React, { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Box,
  Collapse,
  IconButton,
  LinearProgress,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  Circle as StatusIcon,
  AccessTime as TimeIcon,
  MonetizationOn as CostIcon,
  Storage as RequestIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import { formatDistanceToNow } from "date-fns";
import type { Session, SessionUsageEntry } from "../../types";
import { useSessionUsage } from "../../hooks/useApi";
import { ManageSessionBudgetDialog } from "../dialogs";

interface SessionsTableProps {
  sessions: Session[];
  total: number;
  page: number;
  limit: number;
  tenantId: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

interface SessionRowProps {
  session: Session;
  tenantId: number;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, tenantId }) => {
  const [expanded, setExpanded] = useState(false);
  const [usagePage, setUsagePage] = useState(1);
  const [usageLimit] = useState(50); // Load more entries when expanded
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);

  const {
    data: usageData,
    isLoading: usageLoading,
    isFetching: usageIsFetching,
  } = useSessionUsage(
    session.sessionId,
    usagePage,
    usageLimit,
    expanded, // Only fetch when expanded
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "success"; // Session is active and can accept new requests
      case "budget_exceeded":
        return "warning"; // Session budget has been exceeded, requests blocked
      case "completed":
        return "info"; // Session was explicitly marked as completed
      case "error":
        return "error"; // Session encountered an error
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "budget_exceeded":
        return "Budget Exceeded";
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      default:
        return status;
    }
  };

  const getBudgetProgress = () => {
    if (!session.effectiveBudgetUsd || session.effectiveBudgetUsd <= 0) {
      return null;
    }
    return (session.currentCostUsd / session.effectiveBudgetUsd) * 100;
  };

  const progress = getBudgetProgress();
  const isOverBudget = progress !== null && progress > 100;

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "collapse" : "expand"}
            >
              {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
            <Box>
              <Typography variant="body2" fontWeight="medium">
                {session.name || session.sessionId}
              </Typography>
              {session.name && (
                <Typography variant="caption" color="text.secondary">
                  {session.sessionId}
                </Typography>
              )}
            </Box>
          </Box>
        </TableCell>

        <TableCell>
          <Chip
            icon={<StatusIcon />}
            label={getStatusLabel(session.status)}
            size="small"
            color={
              getStatusColor(session.status) as
                | "success"
                | "info"
                | "error"
                | "warning"
                | "default"
            }
            variant="outlined"
          />
        </TableCell>

        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Tooltip title={new Date(session.createdAt).toLocaleString()}>
              <Typography variant="body2">
                {formatDistanceToNow(new Date(session.createdAt), {
                  addSuffix: true,
                })}
              </Typography>
            </Tooltip>
          </Box>
        </TableCell>

        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <TimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Tooltip title={new Date(session.lastActiveAt).toLocaleString()}>
              <Typography variant="body2">
                {formatDistanceToNow(new Date(session.lastActiveAt), {
                  addSuffix: true,
                })}
              </Typography>
            </Tooltip>
          </Box>
        </TableCell>

        <TableCell align="right">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1,
            }}
          >
            <CostIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography
              variant="body2"
              fontWeight="medium"
              color={isOverBudget ? "error.main" : "text.primary"}
            >
              {formatCurrency(session.currentCostUsd, 4, 4)}
            </Typography>
          </Box>
          {progress !== null && (
            <Box sx={{ mt: 0.5, minWidth: 60 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(progress, 100)}
                color={
                  progress > 90
                    ? "error"
                    : progress > 70
                      ? "warning"
                      : "primary"
                }
                sx={{ height: 4, borderRadius: 2 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.7rem" }}
              >
                {progress.toFixed(0)}% of $
                {session.effectiveBudgetUsd?.toFixed(2)}
              </Typography>
            </Box>
          )}
        </TableCell>

        <TableCell align="right">
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 1,
            }}
          >
            <RequestIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography variant="body2">
              {session.requestCount.toLocaleString()}
            </Typography>
          </Box>
        </TableCell>

        <TableCell align="center">
          <Tooltip title="Manage Session Budget">
            <IconButton
              size="small"
              onClick={() => setBudgetDialogOpen(true)}
              color="primary"
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, border: "none" }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 2,
                }}
              >
                <Typography variant="subtitle2">
                  Session Requests ({usageData?.pagination.total || 0} total)
                </Typography>
                {usageIsFetching && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Loading...
                    </Typography>
                  </Box>
                )}
              </Box>

              {usageLoading && !usageData ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <LinearProgress sx={{ width: "100%" }} />
                </Box>
              ) : (
                <>
                  <TableContainer sx={{ maxHeight: 400, mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date & Time</TableCell>
                          <TableCell>Route</TableCell>
                          <TableCell>Model</TableCell>
                          <TableCell align="right">Cost</TableCell>
                          <TableCell align="right">Input Tokens</TableCell>
                          <TableCell align="right">Output Tokens</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {usageData?.usage.map((entry: SessionUsageEntry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Typography variant="caption">
                                {new Date(entry.timestamp).toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {entry.route}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {entry.model}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption" fontWeight="medium">
                                {formatCurrency(entry.usd, 4, 4)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption">
                                {entry.promptTokens.toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="caption">
                                {entry.completionTokens.toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={entry.status}
                                size="small"
                                color={
                                  entry.status === "success"
                                    ? "success"
                                    : "error"
                                }
                                variant="outlined"
                                sx={{ fontSize: "0.6rem", height: 20 }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {usageData && usageData.pagination.totalPages > 1 && (
                    <Box sx={{ display: "flex", justifyContent: "center" }}>
                      <TablePagination
                        component="div"
                        count={usageData.pagination.total}
                        rowsPerPage={usageLimit}
                        page={usagePage - 1}
                        onPageChange={(_, newPage) => setUsagePage(newPage + 1)}
                        rowsPerPageOptions={[]}
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>

      <ManageSessionBudgetDialog
        open={budgetDialogOpen}
        onClose={() => setBudgetDialogOpen(false)}
        tenantId={tenantId}
        sessionId={session.sessionId}
        sessionName={session.name || undefined}
      />
    </>
  );
};

const SessionsTable: React.FC<SessionsTableProps> = ({
  sessions,
  total,
  page,
  limit,
  tenantId,
  onPageChange,
  onLimitChange,
}) => {
  const handleChangePage = (_event: unknown, newPage: number) => {
    onPageChange(newPage + 1); // Convert 0-based to 1-based
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    onLimitChange(parseInt(event.target.value, 10));
    onPageChange(1);
  };

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Sessions
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 200,
              color: "text.secondary",
            }}
          >
            <Typography>No sessions found</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="h6">Sessions</Typography>
          <Typography variant="body2" color="text.secondary">
            {total} sessions total
          </Typography>
        </Box>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Session</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Active</TableCell>
                <TableCell align="right">Cost & Budget</TableCell>
                <TableCell align="right">Requests</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  tenantId={tenantId}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          rowsPerPageOptions={[10, 25, 50]}
          component="div"
          count={total}
          rowsPerPage={limit}
          page={page - 1} // Convert 1-based to 0-based
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </CardContent>
    </Card>
  );
};

export default SessionsTable;
