import React, { useEffect, useRef } from "react";
import { Box, Typography, Card, CardContent } from "@mui/material";
import * as d3 from "d3";
import { formatCurrency } from "../../utils/currency";
import type { TagUsageData } from "../../types";

// D3 types for chart data
interface ChartDataItem {
  name: string;
  value: number;
  percentage: number;
  color: string;
  requests: number;
  path: string;
}

interface ChildSegment {
  data: ChartDataItem & {
    parent: string;
    level: number;
  };
  startAngle: number;
  endAngle: number;
}

interface AngleInfo {
  startAngle: number;
  endAngle: number;
}

type D3Arc = d3.Arc<unknown, d3.PieArcDatum<ChartDataItem>>;
type D3Pie = d3.Pie<unknown, ChartDataItem>;

interface SunburstChartProps {
  data: TagUsageData[];
  title?: string;
  width?: number;
  height?: number;
  totalBudgetUsage?: number; // Total usage including untagged
}

const SunburstChart: React.FC<SunburstChartProps> = ({
  data,
  title = "Tag Usage Analytics",
  width = 500,
  height = 500,
  totalBudgetUsage,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    // Process data for complete circle
    const rootTags = data.filter((tag) => !tag.path.includes("/"));
    const rootTagsUsage = rootTags.reduce((sum, tag) => sum + tag.usage, 0);
    const actualTotal = totalBudgetUsage || rootTagsUsage;
    const untaggedUsage = Math.max(0, actualTotal - rootTagsUsage);

    // Create complete dataset that adds up to 100%
    const completeData = [
      ...rootTags.map((tag) => ({
        name: tag.tagName,
        value: tag.usage,
        percentage: (tag.usage / actualTotal) * 100,
        color: tag.color || "#666",
        requests: tag.requests,
        path: tag.path,
      })),
      ...(untaggedUsage > 0
        ? [
            {
              name: "no tag",
              value: untaggedUsage,
              percentage: (untaggedUsage / actualTotal) * 100,
              color: "#E0E0E0",
              requests: Math.round(untaggedUsage * 10),
              path: "untagged",
            },
          ]
        : []),
    ].sort((a, b) => b.value - a.value);

    // Verify totals add up to 100%
    const totalCheck = completeData.reduce(
      (sum, item) => sum + item.percentage,
      0,
    );
    if (Math.abs(totalCheck - 100) > 0.1) {
      console.warn(`Percentages don't add to 100%: ${totalCheck.toFixed(1)}%`);
    }

    const radius = Math.min(width, height) / 2 - 20;

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    // Create pie layout
    const pie: D3Pie = d3
      .pie<ChartDataItem>()
      .value((d) => d.value)
      .sort((a, b) => b.value - a.value);

    // Detect maximum depth in the data
    const maxDepth = Math.max(...data.map((tag) => tag.path.split("/").length));
    const totalLevels = maxDepth; // 0-indexed levels: 1=root, 2=1child, 3=2child, etc.

    // Calculate ring dimensions dynamically based on depth
    const innerRadius = radius * 0.3; // Center hole
    const availableRadius = radius - innerRadius; // Available space for rings
    const ringWidth = availableRadius / totalLevels; // Equal width per level

    // Create dynamic arc generators for each level
    const arcGenerators: D3Arc[] = [];
    const childArcGenerators: d3.Arc<unknown, ChildSegment>[] = [];

    for (let level = 0; level < totalLevels; level++) {
      const innerR = innerRadius + level * ringWidth;
      const outerR = innerRadius + (level + 1) * ringWidth;

      // Arc generator for pie chart data (root level)
      arcGenerators[level] = d3
        .arc<d3.PieArcDatum<ChartDataItem>>()
        .innerRadius(innerR)
        .outerRadius(outerR);

      // Arc generator for child segments
      childArcGenerators[level] = d3
        .arc<ChildSegment>()
        .innerRadius(innerR)
        .outerRadius(outerR)
        .startAngle((d: ChildSegment) => d.startAngle)
        .endAngle((d: ChildSegment) => d.endAngle);
    }

    // Create tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "sunburst-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background", "rgba(0, 0, 0, 0.8)")
      .style("color", "white")
      .style("padding", "8px 12px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("z-index", "1000");

    // Create inner ring (root tags) - Level 0
    g.selectAll(".level-0-arc")
      .data(pie(completeData))
      .enter()
      .append("path")
      .attr("class", "level-0-arc")
      .attr("d", arcGenerators[0]) // Use first arc generator for root level
      .style("fill", (d) => d.data.color)
      .style("stroke", "#fff")
      .style("stroke-width", "2px")
      .style("opacity", 1.0) // Highest opacity for root level
      .style("cursor", "pointer")
      .on("mouseover", function (_event, d) {
        d3.select(this).style("opacity", 1);

        const content = `
          <div><strong>${d.data.name}</strong></div>
          <div>Level: Root (0)</div>
          <div>Usage: ${formatCurrency(d.data.value)}</div>
          <div>Requests: ${d.data.requests.toLocaleString()}</div>
          <div>Share: ${d.data.percentage.toFixed(1)}%</div>
        `;

        tooltip.style("visibility", "visible").html(content);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).style("opacity", 1.0);
        tooltip.style("visibility", "hidden");
      });

    // Group tags by their depth level
    const tagsByLevel = new Map<number, TagUsageData[] | ChartDataItem[]>();
    for (let level = 1; level <= totalLevels; level++) {
      tagsByLevel.set(
        level,
        data.filter((tag) => tag.path.split("/").length === level),
      );
    }

    // Add root-level data (level 0)
    tagsByLevel.set(0, completeData);

    const allAngles = new Map<string, AngleInfo>();

    // Store root segment angles (level 0)
    pie(completeData).forEach((d) => {
      allAngles.set(d.data.path, {
        startAngle: d.startAngle,
        endAngle: d.endAngle,
      });
    });

    // Process all levels dynamically
    const ringData = new Map<number, ChildSegment[]>(); // level -> data array

    for (let level = 1; level <= totalLevels; level++) {
      const levelTags = (tagsByLevel.get(level) || []) as TagUsageData[];
      const levelData: ChildSegment[] = [];

      if (levelTags.length === 0) continue;

      // Group children by parent
      const childrenByParent = new Map<string, TagUsageData[]>();
      levelTags.forEach((child: TagUsageData) => {
        const pathParts = child.path.split("/");
        const parentPath = pathParts.slice(0, -1).join("/");
        if (!childrenByParent.has(parentPath)) {
          childrenByParent.set(parentPath, []);
        }
        childrenByParent.get(parentPath)!.push(child);
      });

      childrenByParent.forEach((children, parentPath) => {
        const parentAngle = allAngles.get(parentPath);
        if (!parentAngle) return;

        const totalChildUsage = children.reduce(
          (sum: number, child: TagUsageData) => sum + child.usage,
          0,
        );
        const angleRange = parentAngle.endAngle - parentAngle.startAngle;
        let currentAngle = parentAngle.startAngle;

        children.forEach((childTag: TagUsageData) => {
          if (totalChildUsage > 0) {
            const childProportion = childTag.usage / totalChildUsage;
            const childAngleSize = angleRange * childProportion;

            const childSegment = {
              data: {
                name: childTag.tagName,
                value: childTag.usage,
                percentage: (childTag.usage / actualTotal) * 100,
                color: childTag.color || "#999",
                requests: childTag.requests,
                path: childTag.path,
                parent: parentPath,
                level: level,
              },
              startAngle: currentAngle,
              endAngle: currentAngle + childAngleSize,
            };

            levelData.push(childSegment);

            // Store this segment's angles for next level children
            allAngles.set(childTag.path, {
              startAngle: currentAngle,
              endAngle: currentAngle + childAngleSize,
            });

            currentAngle += childAngleSize;
          }
        });
      });

      ringData.set(level, levelData);
    }

    // Draw all rings dynamically
    for (let level = 1; level <= totalLevels; level++) {
      const levelData = ringData.get(level) || [];
      if (levelData.length === 0) continue;

      const arcGenerator = childArcGenerators[level - 1]; // 0-indexed array
      const baseOpacity = Math.max(0.4, 1 - level * 0.1); // Decreasing opacity with depth

      g.selectAll(`.level-${level}-arc`)
        .data(levelData)
        .enter()
        .append("path")
        .attr("class", `level-${level}-arc`)
        .attr("d", arcGenerator)
        .style("fill", (d: ChildSegment) => d.data.color)
        .style("stroke", "#fff")
        .style("stroke-width", "1px")
        .style("opacity", baseOpacity)
        .style("cursor", "pointer")
        .on("mouseover", function (_event, d: ChildSegment) {
          d3.select(this).style("opacity", 1);

          const content = `
            <div><strong>${d.data.name}</strong></div>
            <div>Parent: ${d.data.parent || "Root"}</div>
            <div>Level: ${d.data.level}</div>
            <div>Usage: ${formatCurrency(d.data.value)}</div>
            <div>Requests: ${d.data.requests.toLocaleString()}</div>
            <div>Share: ${d.data.percentage.toFixed(1)}%</div>
          `;

          tooltip.style("visibility", "visible").html(content);
        })
        .on("mousemove", function (event) {
          tooltip
            .style("top", event.pageY - 10 + "px")
            .style("left", event.pageX + 10 + "px");
        })
        .on("mouseout", function () {
          d3.select(this).style("opacity", baseOpacity);
          tooltip.style("visibility", "hidden");
        });
    }

    // Add center labels
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "16px")
      .style("font-weight", "600")
      .style("fill", "currentColor")
      .text(formatCurrency(actualTotal));

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("y", 20)
      .style("font-size", "12px")
      .style("fill", "currentColor")
      .style("opacity", 0.7)
      .text("Total Usage");

    // Cleanup on unmount
    return () => {
      d3.selectAll(".sunburst-tooltip").remove();
    };
  }, [data, width, height, totalBudgetUsage]);

  // Create legend data
  const rootTags = data.filter((tag) => !tag.path.includes("/"));
  const childTags = data.filter((tag) => tag.path.includes("/"));
  const rootTagsUsage = rootTags.reduce((sum, tag) => sum + tag.usage, 0);
  const actualTotal = totalBudgetUsage || rootTagsUsage;
  const untaggedUsage = Math.max(0, actualTotal - rootTagsUsage);

  const legendData = [
    ...rootTags.map((tag) => ({
      name: tag.tagName,
      value: tag.usage,
      percentage: (tag.usage / actualTotal) * 100,
      color: tag.color || "#666",
      requests: tag.requests,
    })),
    ...(untaggedUsage > 0
      ? [
          {
            name: "no tag",
            value: untaggedUsage,
            percentage: (untaggedUsage / actualTotal) * 100,
            color: "#E0E0E0",
            requests: Math.round(untaggedUsage * 10),
          },
        ]
      : []),
  ].sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          {title}
        </Typography>

        <Box sx={{ display: "flex", gap: 3 }}>
          {/* Chart */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <svg ref={svgRef}></svg>
          </Box>

          {/* Legend */}
          <Box sx={{ width: 200, pl: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Usage Breakdown
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {legendData.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 0.5,
                    px: 1,
                    borderRadius: 1,
                    "&:hover": { backgroundColor: "action.hover" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{ fontSize: "0.75rem" }}
                    >
                      {item.name}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right", ml: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      {formatCurrency(item.value)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: "0.65rem" }}
                    >
                      {item.percentage.toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* Summary Stats */}
            <Box
              sx={{
                mt: 2,
                pt: 2,
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Root Tags:
                  </Typography>
                  <Typography variant="caption" fontWeight={500}>
                    {rootTags.length}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Child Tags:
                  </Typography>
                  <Typography variant="caption" fontWeight={500}>
                    {childTags.length}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Usage:
                  </Typography>
                  <Typography variant="caption" fontWeight={500}>
                    {formatCurrency(actualTotal)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Instructions */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 2, display: "block", textAlign: "center" }}
        >
          <strong>Inner ring:</strong> Root tags • <strong>Outer rings:</strong>{" "}
          Child tags • Hover over segments for detailed breakdown
        </Typography>
      </CardContent>
    </Card>
  );
};

export default SunburstChart;
