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
} from "@mui/material";
import {
  Memory as ModelIcon,
  LocalOffer as TagIcon,
  Api as RouteIcon,
} from "@mui/icons-material";
import { formatCurrency } from "../../utils/currency";
import type { TopUsageItem } from "../../hooks/useUsageInsights";

interface TopUsageTableProps {
  data: TopUsageItem[];
  title?: string;
  maxHeight?: number;
}

const TopUsageTable: React.FC<TopUsageTableProps> = ({
  data,
  title = "Top Usage Details",
  maxHeight = 400,
}) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getTypeIcon = (type: TopUsageItem["type"]) => {
    switch (type) {
      case "model":
        return <ModelIcon sx={{ fontSize: 16 }} />;
      case "tag":
        return <TagIcon sx={{ fontSize: 16 }} />;
      case "route":
        return <RouteIcon sx={{ fontSize: 16 }} />;
      default:
        return undefined;
    }
  };

  const getTypeColor = (type: TopUsageItem["type"]) => {
    switch (type) {
      case "model":
        return "primary";
      case "tag":
        return "success";
      case "route":
        return "info";
      default:
        return "default";
    }
  };

  const paginatedData = data.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage,
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {title}
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
            <Typography>No usage data available</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="h6">{title}</Typography>
        </Box>

        <TableContainer sx={{ maxHeight }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right">Usage</TableCell>
                <TableCell align="right">Requests</TableCell>
                <TableCell align="right">% of Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedData.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell>
                    <Chip
                      icon={getTypeIcon(item.type)}
                      label={item.type}
                      size="small"
                      color={
                        getTypeColor(item.type) as
                          | "primary"
                          | "success"
                          | "info"
                          | "default"
                      }
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {item.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium">
                      {formatCurrency(item.usage)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {item.requests.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {item.percentage.toFixed(1)}%
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {data.length > rowsPerPage && (
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={data.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default TopUsageTable;
