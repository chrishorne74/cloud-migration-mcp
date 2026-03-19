import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { STRATEGY_DEFINITIONS, getStrategyDefinition } from "../lib/seven-rs.js";
import { estimateCost } from "../lib/cost-estimator.js";
import type { MigrationStrategy, WorkloadInput } from "../types/index.js";

export function registerStrategyTools(server: McpServer): void {

  // ── list_migration_strategies ─────────────────────────────────────────────
  server.tool(
    "list_migration_strategies",
    "List all 7 cloud migration strategies (the 7 Rs) with their descriptions, effort level, " +
      "cloud benefit, risk level, typical indicators, and exclusions. " +
      "Use this to understand when each strategy applies before making recommendations.",
    {
      strategy: z
        .enum(["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"])
        .optional()
        .describe("Filter to a specific strategy"),
    },
    async ({ strategy }) => {
      const defs = strategy
        ? STRATEGY_DEFINITIONS.filter((d) => d.name === strategy)
        : STRATEGY_DEFINITIONS;

      const effortEmoji = (e: string) => e === "Low" ? "🟢" : e === "Medium" ? "🟡" : "🔴";
      const benefitEmoji = (b: string) => b === "Low" ? "🟢" : b === "Medium" ? "🟡" : "🔵";

      const lines: string[] = [
        `# Cloud Migration Strategies — The 7 Rs\n`,
      ];

      for (const def of defs) {
        lines.push(`\n## ${def.name} (${def.alias})`);
        lines.push(def.description);
        lines.push(
          `\n**Effort:** ${effortEmoji(def.effort)} ${def.effort} | ` +
          `**Cloud Benefit:** ${benefitEmoji(def.cloudBenefit)} ${def.cloudBenefit} | ` +
          `**Risk:** ${effortEmoji(def.risk)} ${def.risk}`
        );

        lines.push("\n**Typical Indicators (when to use):**");
        for (const i of def.typicalIndicators) lines.push(`- ${i}`);

        lines.push("\n**Typical Exclusions (when NOT to use):**");
        for (const e of def.typicalExclusions) lines.push(`- ${e}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── recommend_migration_strategy ──────────────────────────────────────────
  server.tool(
    "recommend_migration_strategy",
    "Recommend one of the 7 Rs migration strategies for a workload based on its attributes. " +
      "Returns the primary recommendation, alternatives, detailed rationale, and key indicators that drove the recommendation. " +
      "For a full assessment including scoring and guardrail checks, use assess_workload instead.",
    {
      name: z.string().describe("Workload name"),
      technology: z.string().optional().describe("Technology stack, e.g. 'Java Spring Boot', 'COBOL'"),
      currentEnvironment: z.string().optional().describe("Current hosting environment"),
      database: z.string().optional().describe("Primary database"),
      businessCriticality: z.number().min(1).max(5).optional(),
      dependencyCount: z.number().min(0).optional(),
      saasAlternativeExists: z.boolean().optional(),
      vendorSupportActive: z.boolean().optional(),
      sourceCodeAvailable: z.boolean().optional(),
      ageYears: z.number().min(0).optional(),
      annualCostUsd: z.number().min(0).optional(),
      userCount: z.number().min(0).optional(),
      dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
      complianceRequirements: z.array(z.string()).optional(),
      attributes: z
        .array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
        .optional(),
    },
    async (workloadArgs) => {
      const { recommendStrategy } = await import("../lib/seven-rs.js");
      const workload = workloadArgs as WorkloadInput;

      // Rough overall score for strategy engine
      const roughScore =
        ((workload.businessCriticality ?? 3) <= 2 ? 70 : 40) +
        ((workload.dependencyCount ?? 10) <= 5 ? 20 : 0) +
        (workload.sourceCodeAvailable ? 10 : 0);

      const { primary, alternatives, rationale } = recommendStrategy(workload, roughScore);
      const def = getStrategyDefinition(primary)!;

      const lines: string[] = [
        `# Migration Strategy Recommendation: ${workload.name}\n`,
        `## Recommendation: **${primary}** (${def.alias})`,
        "",
        def.description,
        "",
        `**Effort:** ${def.effort} | **Cloud Benefit:** ${def.cloudBenefit} | **Risk:** ${def.risk}`,
        "",
        "## Rationale",
        ...rationale.map((r) => `- ${r}`),
        "",
        `## Alternative Strategies`,
        ...alternatives.map((a) => {
          const altDef = getStrategyDefinition(a)!;
          return `- **${a}** (${altDef.alias}) — ${altDef.description.slice(0, 100)}…`;
        }),
        "",
        `## Key Indicators for ${primary}`,
        ...def.typicalIndicators.map((i) => `- ${i}`),
        "",
        "## When NOT to use this strategy",
        ...def.typicalExclusions.map((e) => `- ${e}`),
        "",
        "> For a full scored assessment including guardrail checks and scoring breakdown, use `assess_workload`.",
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── estimate_migration_cost ───────────────────────────────────────────────
  server.tool(
    "estimate_migration_cost",
    "Produce a rough-order-of-magnitude (ROM ±50%) cost estimate for a workload migration. " +
      "Returns estimated cloud annual costs, one-time migration costs, 1-year and 3-year savings, " +
      "ROI break-even months, and cost breakdown. " +
      "Requires the current annual cost and migration strategy as inputs.",
    {
      workloadName: z.string().describe("Workload name"),
      annualCostUsd: z.number().min(0).describe("Current annual run cost in USD"),
      strategy: z
        .enum(["Rehost", "Replatform", "Repurchase", "Refactor", "Retire", "Retain", "Relocate"])
        .describe("Migration strategy to estimate costs for"),
      targetCloud: z
        .enum(["aws", "azure", "gcp"])
        .default("aws")
        .describe("Target cloud provider"),
    },
    async ({ workloadName, annualCostUsd, strategy, targetCloud }) => {
      const workload: WorkloadInput = { name: workloadName, annualCostUsd };
      const estimate = estimateCost(workload, strategy as MigrationStrategy, targetCloud);

      const sign = (n: number) => (n >= 0 ? "+" : "");
      const fmt = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

      const lines: string[] = [
        `# Migration Cost Estimate: ${workloadName}\n`,
        `**Strategy:** ${strategy} → ${targetCloud.toUpperCase()}`,
        `**Note:** ROM estimate ±50% — use cloud pricing calculators for detailed quotes.\n`,
        `## Financial Summary`,
        `| Item | Amount |`,
        `|---|---|`,
        `| Current Annual Cost | ${fmt(estimate.currentAnnualCostUsd)} |`,
        `| Estimated Cloud Annual Cost | ${fmt(estimate.estimatedCloudAnnualCostUsd)} |`,
        `| Migration One-Time Cost | ${fmt(estimate.migrationOneTimeCostUsd)} |`,
        `| Year 1 Net Saving | ${sign(estimate.estimatedSavingsYear1Usd)}${fmt(estimate.estimatedSavingsYear1Usd)} |`,
        `| 3-Year Net Saving | ${sign(estimate.estimatedSavingsYear3Usd)}${fmt(estimate.estimatedSavingsYear3Usd)} |`,
        `| ROI Break-Even | ${estimate.roiBreakEvenMonths >= 999 ? "N/A" : `${estimate.roiBreakEvenMonths} months`} |`,
        "",
        `## Cloud Annual Cost Breakdown`,
        `| Item | Annual Cost | Notes |`,
        `|---|---|---|`,
        ...estimate.cloudCostBreakdown.map(
          (item) => `| ${item.item} | ${item.annualCostUsd !== undefined ? fmt(item.annualCostUsd) : "—"} | ${item.notes} |`
        ),
        "",
        `## Migration One-Time Cost Breakdown`,
        `| Item | Cost | Notes |`,
        `|---|---|---|`,
        ...estimate.migrationCostBreakdown.map(
          (item) => `| ${item.item} | ${item.oneTimeCostUsd !== undefined ? fmt(item.oneTimeCostUsd) : "—"} | ${item.notes} |`
        ),
        "",
        `## Assumptions`,
        ...estimate.assumptions.map((a) => `- ${a}`),
        "",
        `## Caveats`,
        ...estimate.caveats.map((c) => `- ${c}`),
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
