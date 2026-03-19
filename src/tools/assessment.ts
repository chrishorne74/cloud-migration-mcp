import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { assessWorkload, loadCriteria, rankWorkloads, invalidateCriteriaCache, saveCriteria } from "../lib/scoring.js";
import { getGuardrailsPath } from "./guardrails.js";
import * as fs from "fs";

export function getCriteriaPath(): string {
  const override = (process.env["USER_CRITERIA_FILE"] ?? "").trim();
  if (override) return override;
  return (process.env["CRITERIA_FILE"] ?? "").trim() || "./criteria/migration-criteria.json";
}

// Shared workload schema for re-use across tools
const WorkloadSchema = z.object({
  name: z.string().describe("Workload / application name"),
  description: z.string().optional().describe("Brief description of what the application does"),
  technology: z.string().optional().describe("Primary technology stack, e.g. 'Java Spring Boot', '.NET Framework 4.6', 'COBOL'"),
  currentEnvironment: z.string().optional().describe("Where it currently runs, e.g. 'on-premises', 'colocation', 'hosted'"),
  operatingSystem: z.string().optional().describe("OS, e.g. 'Windows Server 2012', 'RHEL 7'"),
  database: z.string().optional().describe("Primary database, e.g. 'SQL Server 2012', 'Oracle 11g'"),
  businessCriticality: z.number().min(1).max(5).optional().describe("Business criticality 1 (low) to 5 (mission critical)"),
  dependencyCount: z.number().min(0).optional().describe("Number of upstream/downstream application dependencies"),
  userCount: z.number().min(0).optional().describe("Number of active users"),
  annualCostUsd: z.number().min(0).optional().describe("Current annual run cost in USD"),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  complianceRequirements: z.array(z.string()).optional().describe("Compliance frameworks, e.g. ['PCI-DSS', 'HIPAA']"),
  saasAlternativeExists: z.boolean().optional().describe("Is there a viable SaaS replacement?"),
  vendorSupportActive: z.boolean().optional().describe("Is the vendor still providing active support?"),
  ageYears: z.number().min(0).optional().describe("Application age in years"),
  documentationLevel: z.enum(["low", "medium", "high"]).optional(),
  sourceCodeAvailable: z.boolean().optional().describe("Is source code available to the team?"),
  attributes: z
    .array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional()
    .describe("Custom attributes e.g. [{name: 'hypervisor', value: 'vmware'}]"),
});

export function registerAssessmentTools(server: McpServer): void {

  // ── assess_workload ───────────────────────────────────────────────────────
  server.tool(
    "assess_workload",
    "Assess a single application workload for cloud migration readiness. " +
      "Returns an overall migration score (0–100), readiness status, recommended 7R strategy, " +
      "guardrail violations, effort and risk estimates, and prioritised recommendations. " +
      "Provide as much workload detail as possible for accurate results.",
    { workload: WorkloadSchema },
    async ({ workload }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const assessment = assessWorkload(workload as WorkloadInput, criteriaDoc, getGuardrailsPath());

      const readinessEmoji =
        assessment.migrationReadiness === "Ready" ? "✅"
        : assessment.migrationReadiness === "Needs Work" ? "⚠️"
        : "❌";

      const lines: string[] = [
        `# Migration Assessment: ${assessment.workloadName}\n`,
        `## Summary`,
        `${readinessEmoji} **Migration Readiness:** ${assessment.migrationReadiness}`,
        `**Overall Score:** ${assessment.overallScore}/100`,
        `**Recommended Strategy:** ${assessment.recommendedStrategy}`,
        `**Alternative Strategies:** ${assessment.alternativeStrategies.join(", ")}`,
        `**Estimated Effort:** ${assessment.estimatedEffort} | **Estimated Risk:** ${assessment.estimatedRisk}`,
        "",
      ];

      if (assessment.keyFindings.length > 0) {
        lines.push("## Key Findings");
        for (const f of assessment.keyFindings) lines.push(`- ${f}`);
        lines.push("");
      }

      if (assessment.recommendations.length > 0) {
        lines.push("## Recommendations");
        for (const r of assessment.recommendations) lines.push(`- ${r}`);
        lines.push("");
      }

      if (assessment.guardrailViolations.length > 0) {
        lines.push(`## ⚠️ Guardrail Violations (${assessment.guardrailViolations.length})`);
        for (const v of assessment.guardrailViolations) {
          const sev = v.severity === "CRITICAL" ? "🔴" : v.severity === "HIGH" ? "🟠" : v.severity === "MEDIUM" ? "🟡" : "🟢";
          lines.push(`\n### [${v.guardrailId}] ${sev} ${v.severity} — ${v.rule}`);
          lines.push(`**Detail:** ${v.detail}`);
          lines.push(`**Action:** ${v.recommendation}`);
        }
        lines.push("");
      }

      lines.push("## Scoring Breakdown");
      lines.push("| Criterion | Score | Weight | Weighted | Rationale |");
      lines.push("|---|---|---|---|---|");
      for (const c of assessment.criterionScores) {
        lines.push(`| ${c.criterionName} | ${c.score}/100 | ${c.weight} | ${c.weightedScore.toFixed(1)} | ${c.rationale} |`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── score_migration_candidates ────────────────────────────────────────────
  server.tool(
    "score_migration_candidates",
    "Score and rank multiple workloads as cloud migration candidates. " +
      "Returns a prioritised list with scores, readiness, recommended strategy, effort and risk. " +
      "Higher score = better migration candidate. Useful for portfolio-level migration planning.",
    {
      workloads: z
        .array(WorkloadSchema)
        .min(1)
        .max(50)
        .describe("List of workloads to score and rank"),
    },
    async ({ workloads }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const ranked = rankWorkloads(workloads as WorkloadInput[], criteriaDoc, getGuardrailsPath());

      const lines: string[] = [
        `# Migration Candidate Scoring — ${workloads.length} Workload(s)\n`,
        `| Rank | Workload | Score | Readiness | Strategy | Effort | Risk |`,
        `|---|---|---|---|---|---|---|`,
      ];

      for (const r of ranked) {
        const readinessEmoji =
          r.migrationReadiness === "Ready" ? "✅"
          : r.migrationReadiness === "Needs Work" ? "⚠️"
          : "❌";
        lines.push(
          `| #${r.rank} | ${r.workloadName} | ${r.overallScore}/100 | ${readinessEmoji} ${r.migrationReadiness} | ${r.recommendedStrategy} | ${r.estimatedEffort} | ${r.estimatedRisk} |`
        );
      }

      lines.push("\n## Key Findings by Workload");
      for (const r of ranked) {
        if (r.keyFindings.length > 0) {
          lines.push(`\n**${r.workloadName}** (Score: ${r.overallScore})`);
          for (const f of r.keyFindings) lines.push(`  - ${f}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── list_migration_criteria ───────────────────────────────────────────────
  server.tool(
    "list_migration_criteria",
    "List all scoring criteria used to assess migration candidates. " +
      "Each criterion has a weight and direction (higher-is-better or lower-is-better). " +
      "Use add_migration_criterion or update_migration_criterion to customise.",
    {},
    async () => {
      const doc = loadCriteria(getCriteriaPath());

      const lines: string[] = [
        `# Migration Scoring Criteria\n`,
        `**Total criteria:** ${doc.criteria.length} | **Total weight:** ${doc.totalWeight}`,
        `**Source:** \`${doc.filePath}\`\n`,
        `| ID | Name | Weight | Direction | Description |`,
        `|---|---|---|---|---|`,
      ];

      for (const c of doc.criteria) {
        lines.push(`| ${c.id} | ${c.name} | ${c.weight} | ${c.direction} | ${c.description.slice(0, 80)}… |`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── add_migration_criterion ───────────────────────────────────────────────
  server.tool(
    "add_migration_criterion",
    "Add a new scoring criterion to the migration criteria file. " +
      "The criterion will be used in future workload assessments.",
    {
      id: z.string().describe("Unique criterion ID, e.g. CRIT-011"),
      name: z.string().describe("Criterion name"),
      description: z.string().describe("What this criterion measures"),
      weight: z.number().min(1).max(10).describe("Relative weight 1 (low importance) to 10 (high importance)"),
      direction: z
        .enum(["higher-is-better", "lower-is-better"])
        .describe("Whether a higher attribute value is better or worse for migration"),
      notes: z.string().optional().describe("Scoring notes — how this criterion maps attribute values to scores"),
    },
    async ({ id, name, description, weight, direction, notes }) => {
      const path = getCriteriaPath();
      const doc = loadCriteria(path);

      if (doc.criteria.some((c) => c.id === id)) {
        return {
          content: [{ type: "text", text: `❌ Criterion ID \`${id}\` already exists.` }],
          isError: true,
        };
      }

      doc.criteria.push({ id, name, description, weight, direction, notes });
      doc.totalWeight = doc.criteria.reduce((s, c) => s + c.weight, 0);
      saveCriteria(doc);

      return {
        content: [{ type: "text", text: `✅ Criterion **${id} — ${name}** added (weight: ${weight}).` }],
      };
    }
  );

  // ── update_migration_criterion ────────────────────────────────────────────
  server.tool(
    "update_migration_criterion",
    "Update an existing migration scoring criterion by ID.",
    {
      id: z.string().describe("Criterion ID to update"),
      weight: z.number().min(1).max(10).optional(),
      description: z.string().optional(),
      direction: z.enum(["higher-is-better", "lower-is-better"]).optional(),
    },
    async ({ id, weight, description, direction }) => {
      const path = getCriteriaPath();
      const doc = loadCriteria(path);
      const criterion = doc.criteria.find((c) => c.id === id);

      if (!criterion) {
        return {
          content: [{ type: "text", text: `❌ Criterion \`${id}\` not found.` }],
          isError: true,
        };
      }

      if (weight !== undefined) criterion.weight = weight;
      if (description !== undefined) criterion.description = description;
      if (direction !== undefined) criterion.direction = direction;
      doc.totalWeight = doc.criteria.reduce((s, c) => s + c.weight, 0);
      saveCriteria(doc);
      invalidateCriteriaCache();

      return {
        content: [{ type: "text", text: `✅ Criterion **${id}** updated.` }],
      };
    }
  );

  // ── check_migration_guardrails ────────────────────────────────────────────
  server.tool(
    "check_migration_guardrails",
    "Run automated migration guardrail checks against a workload description. " +
      "Returns any guardrail violations that can be detected from the workload attributes. " +
      "Not all guardrails can be checked automatically — use list_migration_guardrails for the full set.",
    { workload: WorkloadSchema },
    async ({ workload }) => {
      const { checkWorkloadGuardrails, getGuardrailsDocument } = await import("../lib/guardrails-engine.js");
      const doc = getGuardrailsDocument(getGuardrailsPath());
      const violations = checkWorkloadGuardrails(workload as WorkloadInput, doc);

      if (violations.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `✅ **${workload.name}** — No automated guardrail violations detected.\n\nNote: Not all guardrails can be checked automatically. Review \`list_migration_guardrails\` for manual checklist items.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `# Guardrail Check: ${workload.name}\n`,
        `❌ **${violations.length} violation(s) detected**\n`,
      ];

      const criticals = violations.filter((v) => v.severity === "CRITICAL");
      const highs = violations.filter((v) => v.severity === "HIGH");
      const others = violations.filter((v) => !["CRITICAL", "HIGH"].includes(v.severity));

      for (const group of [
        { label: "CRITICAL", items: criticals, emoji: "🔴" },
        { label: "HIGH", items: highs, emoji: "🟠" },
        { label: "MEDIUM/LOW", items: others, emoji: "🟡" },
      ]) {
        if (group.items.length === 0) continue;
        lines.push(`## ${group.emoji} ${group.label} (${group.items.length})`);
        for (const v of group.items) {
          lines.push(`\n### [${v.guardrailId}] ${v.rule}`);
          lines.push(`**Detail:** ${v.detail}`);
          lines.push(`**Action:** ${v.recommendation}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
