import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput, MigrationStrategy } from "../types/index.js";
import { generateRunbook } from "../lib/runbook-generator.js";

const RunbookWorkloadSchema = z.object({
  name: z.string().describe("Workload / application name"),
  description: z.string().optional(),
  database: z.string().optional().describe("Primary database — included in runbook steps if provided"),
  technology: z.string().optional(),
  businessCriticality: z.number().min(1).max(5).optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerRunbookTools(server: McpServer): void {
  server.tool(
    "generate_migration_runbook",
    "Generate a structured migration cutover runbook for a workload and strategy. " +
      "Returns a pre-flight checklist, strategy-specific cutover steps (Rehost, Replatform, Refactor, Repurchase, Retire, Relocate, or Retain), " +
      "rollback criteria and procedure, and a post-cutover hypercare plan. " +
      "Each step includes the suggested owner role and timing relative to the cutover window (T-0). " +
      "Use this to produce an operational handoff document for the migration team.",
    {
      workload: RunbookWorkloadSchema,
      strategy: z
        .enum(["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"])
        .describe("The 7R migration strategy assigned to this workload"),
      targetCloud: z
        .enum(["aws", "azure", "gcp"])
        .optional()
        .describe("Target cloud provider — used to tailor tool names in the runbook"),
    },
    async ({ workload, strategy, targetCloud }) => {
      const runbook = generateRunbook(workload as WorkloadInput, strategy as MigrationStrategy, targetCloud);

      const cloudLabel = targetCloud ? ` → ${targetCloud.toUpperCase()}` : "";

      const lines: string[] = [
        `# Migration Runbook: ${runbook.workloadName}`,
        `**Strategy:** ${runbook.strategy}${cloudLabel} | **Generated:** ${runbook.generatedDate}`,
        "",
        `> ⚠️ This runbook is a template. Review and customise all steps with your migration team before use. Owner roles are suggestions only.`,
        "",
      ];

      for (const section of runbook.sections) {
        lines.push(`## ${section.title}\n`);
        lines.push("| Step | Task | Owner | Timing |");
        lines.push("|---|---|---|---|");
        for (const item of section.items) {
          const task = item.notes ? `${item.task} *(${item.notes})*` : item.task;
          lines.push(`| ${item.id} | ${task} | ${item.owner} | ${item.timing} |`);
        }
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
