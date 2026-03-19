import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildMigrationDiagramXml, buildAssessmentDiagram } from "../lib/drawio-builder.js";
import { assessWorkload, loadCriteria } from "../lib/scoring.js";
import { getGuardrailsPath } from "./guardrails.js";
import { getCriteriaPath } from "./assessment.js";
import type { DiagramEdge, DiagramNode, MigrationDiagramSpec, MigrationStrategy, WorkloadInput } from "../types/index.js";

export function registerDiagramTools(server: McpServer): void {

  // ── generate_migration_diagram ────────────────────────────────────────────
  server.tool(
    "generate_migration_diagram",
    "Generate a draw.io XML migration architecture diagram showing source and target environments. " +
      "Uses native draw.io AWS, Azure, or GCP shapes. " +
      "Pass the returned XML to the draw.io MCP server `open_drawio_xml` tool to open it. " +
      "Nodes in the source environment are annotated with their migration strategy. " +
      "Target nodes use cloud-native service shapes.",
    {
      title: z.string().describe("Diagram title"),
      sourceEnvironment: z.string().optional().default("Source (On-Premises)").describe("Source environment label"),
      targetCloud: z.enum(["aws", "azure", "gcp"]).default("aws").describe("Target cloud provider"),
      sourceNodes: z
        .array(
          z.object({
            id: z.string().describe("Unique node ID"),
            label: z.string().describe("Display label"),
            type: z.enum(["workload", "database", "network", "storage", "compute", "security", "integration", "container", "group"]),
            strategy: z
              .enum(["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"])
              .optional()
              .describe("Migration strategy for colour coding"),
          })
        )
        .describe("Nodes in the source environment"),
      targetNodes: z
        .array(
          z.object({
            id: z.string().describe("Unique node ID"),
            label: z.string().describe("Display label"),
            service: z.string().optional().describe("Cloud service shape, e.g. 'ec2', 'rds', 'aks', 'gke', 'lambda', 's3'"),
            strategy: z
              .enum(["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"])
              .optional(),
          })
        )
        .describe("Nodes in the target cloud environment"),
      edges: z
        .array(
          z.object({
            source: z.string().describe("Source node ID"),
            target: z.string().describe("Target node ID"),
            label: z.string().optional().describe("Edge label"),
            style: z.enum(["solid", "dashed", "dotted"]).optional().default("solid"),
          })
        )
        .optional()
        .default([])
        .describe("Connections between nodes"),
    },
    async ({ title, sourceEnvironment, targetCloud, sourceNodes, targetNodes, edges }) => {
      const spec: MigrationDiagramSpec = {
        title,
        sourceEnvironment,
        targetCloud,
        sourceNodes: sourceNodes as DiagramNode[],
        targetNodes: targetNodes as DiagramNode[],
        edges: (edges ?? []) as DiagramEdge[],
      };

      const xml = buildMigrationDiagramXml(spec);

      return {
        content: [
          {
            type: "text",
            text:
              `# Migration Diagram: ${title}\n\n` +
              `Pass the XML below to the draw.io MCP server \`open_drawio_xml\` tool to open it.\n\n` +
              `**Target Cloud:** ${targetCloud.toUpperCase()} | **Source Nodes:** ${sourceNodes.length} | **Target Nodes:** ${targetNodes.length}\n\n` +
              "## Draw.io XML\n\n```xml\n" +
              xml +
              "\n```",
          },
        ],
      };
    }
  );

  // ── generate_assessment_diagram ───────────────────────────────────────────
  server.tool(
    "generate_assessment_diagram",
    "Assess a workload and generate a draw.io migration diagram in one step. " +
      "Automatically populates the diagram based on the workload's technology and recommended strategy. " +
      "Pass the returned XML to the draw.io MCP `open_drawio_xml` tool.",
    {
      workload: z.object({
        name: z.string(),
        description: z.string().optional(),
        technology: z.string().optional(),
        currentEnvironment: z.string().optional(),
        operatingSystem: z.string().optional(),
        database: z.string().optional(),
        businessCriticality: z.number().min(1).max(5).optional(),
        dependencyCount: z.number().min(0).optional(),
        userCount: z.number().min(0).optional(),
        annualCostUsd: z.number().min(0).optional(),
        dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
        complianceRequirements: z.array(z.string()).optional(),
        saasAlternativeExists: z.boolean().optional(),
        vendorSupportActive: z.boolean().optional(),
        ageYears: z.number().min(0).optional(),
        documentationLevel: z.enum(["low", "medium", "high"]).optional(),
        sourceCodeAvailable: z.boolean().optional(),
        attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
      }),
      targetCloud: z.enum(["aws", "azure", "gcp"]).default("aws"),
    },
    async ({ workload, targetCloud }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const assessment = assessWorkload(workload as WorkloadInput, criteriaDoc, getGuardrailsPath());
      const strategy = assessment.recommendedStrategy;

      // Auto-map workload components to diagram nodes
      const sourceComponents: { label: string; type: string }[] = [
        { label: workload.name, type: "workload" },
      ];
      if (workload.database) {
        sourceComponents.push({ label: workload.database, type: "database" });
      }

      // Map to target services based on strategy and cloud
      const targetComponents = deriveTargetComponents(workload as WorkloadInput, strategy, targetCloud);

      const xml = buildAssessmentDiagram(
        workload.name,
        strategy,
        targetCloud,
        sourceComponents,
        targetComponents
      );

      return {
        content: [
          {
            type: "text",
            text:
              `# Assessment Diagram: ${workload.name}\n\n` +
              `**Recommended Strategy:** ${strategy} → ${targetCloud.toUpperCase()}\n` +
              `**Migration Score:** ${assessment.overallScore}/100 | **Readiness:** ${assessment.migrationReadiness}\n\n` +
              `Pass the XML below to the draw.io MCP \`open_drawio_xml\` tool.\n\n` +
              "## Draw.io XML\n\n```xml\n" +
              xml +
              "\n```",
          },
        ],
      };
    }
  );
}

function deriveTargetComponents(
  workload: WorkloadInput,
  strategy: MigrationStrategy,
  cloud: "aws" | "azure" | "gcp"
): { label: string; service: string }[] {
  const results: { label: string; service: string }[] = [];

  if (strategy === "Retire") {
    return [{ label: "Decommissioned", service: "generic" }];
  }

  if (strategy === "Repurchase") {
    return [{ label: `${workload.name} (SaaS)`, service: "generic" }];
  }

  // Compute mapping
  const computeMap = {
    aws: {
      Rehost: "ec2",
      Replatform: "ecs",
      Refactor: "lambda",
      Relocate: "ec2",
      Retain: "ec2",
      Repurchase: "generic",
      Retire: "generic",
    },
    azure: {
      Rehost: "vm",
      Replatform: "aks",
      Refactor: "functions",
      Relocate: "vm",
      Retain: "vm",
      Repurchase: "generic",
      Retire: "generic",
    },
    gcp: {
      Rehost: "gce",
      Replatform: "gke",
      Refactor: "cloudfunctions",
      Relocate: "gce",
      Retain: "gce",
      Repurchase: "generic",
      Retire: "generic",
    },
  };

  const computeService = computeMap[cloud][strategy] ?? "generic";
  results.push({ label: workload.name, service: computeService });

  // Database mapping
  if (workload.database) {
    const dbMap = {
      aws: strategy === "Rehost" ? "ec2" : "rds",
      azure: strategy === "Rehost" ? "vm" : "sql",
      gcp: strategy === "Rehost" ? "gce" : "cloudsql",
    };
    results.push({ label: workload.database, service: dbMap[cloud] });
  }

  return results;
}
