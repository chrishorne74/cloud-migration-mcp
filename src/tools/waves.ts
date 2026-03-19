import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { planWaves } from "../lib/wave-planner.js";
import { assessWorkload, loadCriteria } from "../lib/scoring.js";
import { getGuardrailsPath } from "./guardrails.js";
import { getCriteriaPath } from "./assessment.js";
import type { WorkloadInput } from "../types/index.js";

export function registerWaveTools(server: McpServer): void {

  // ── create_migration_wave_plan ────────────────────────────────────────────
  server.tool(
    "create_migration_wave_plan",
    "Group a set of workloads into sequenced migration waves. " +
      "Uses dependency declarations, affinity groups, and migration scores to produce an ordered plan. " +
      "Workloads recommended for Retire or Retain are excluded from the wave plan. " +
      "Returns a wave-by-wave plan with estimated duration and rationale for each group.",
    {
      workloads: z
        .array(
          z.object({
            name: z.string().describe("Workload name"),
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
            // Wave planning extras
            group: z.string().optional().describe("Affinity group tag — workloads with the same group tag are placed in the same wave"),
            dependsOn: z.array(z.string()).optional().describe("Names of workloads that must be migrated before this one"),
          })
        )
        .min(1)
        .max(100)
        .describe("List of workloads to plan waves for"),
      maxWorkloadsPerWave: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum workloads per wave (default: 5)"),
    },
    async ({ workloads, maxWorkloadsPerWave }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const guardrailsPath = getGuardrailsPath();

      const inputs = workloads.map((w) => {
        const { group, dependsOn, ...workloadData } = w;
        const assessment = assessWorkload(workloadData as WorkloadInput, criteriaDoc, guardrailsPath);
        return { assessment, group, dependsOn };
      });

      const plan = planWaves(inputs, maxWorkloadsPerWave);

      const lines: string[] = [
        `# Migration Wave Plan\n`,
        `**Total workloads to migrate:** ${plan.totalWorkloads}`,
        `**Total waves:** ${plan.waves.length}`,
        `**Estimated sequential duration:** ${plan.estimatedTotalWeeks} weeks\n`,
      ];

      if (plan.notes.length > 0) {
        lines.push("## Notes");
        for (const n of plan.notes) lines.push(`- ${n}`);
        lines.push("");
      }

      lines.push("## Wave Plan");

      for (const wave of plan.waves) {
        lines.push(`\n### ${wave.name}`);
        lines.push(`**Workloads (${wave.workloads.length}):** ${wave.workloads.join(", ")}`);
        lines.push(`**Estimated Duration:** ${wave.estimatedDurationWeeks} weeks`);
        if (wave.dependencies.length > 0) {
          lines.push(`**Depends On:** Wave(s) ${wave.dependencies.join(", ")}`);
        }
        lines.push(`**Rationale:** ${wave.rationale}`);
      }

      lines.push(
        "\n---\n> **Wave 0 (Landing Zone)** must be completed before Wave 1. " +
          "This includes VPC/VNet design, IAM baseline, security controls, DNS, shared services, and monitoring. " +
          "Wave 0 is not assessed by this tool — engage your cloud provider or use the cloud-architecture-mcp."
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
