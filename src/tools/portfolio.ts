import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput, MigrationAssessment } from "../types/index.js";
import { generatePortfolioReport } from "../lib/portfolio-reporter.js";
import { estimateCarbonImpact } from "../lib/carbon-impact.js";
import { assessWorkload, loadCriteria } from "../lib/scoring.js";
import { getCriteriaPath } from "./assessment.js";
import { getGuardrailsPath } from "./guardrails.js";

// Minimal workload schema for portfolio input — mirrors assessment schema
const PortfolioWorkloadSchema = z.object({
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
  cpuUtilisation90DayAvgPct: z.number().min(0).max(100).optional(),
  hasInboundConnections90Day: z.boolean().optional(),
  architectureAntiPatternCount: z.number().min(0).optional(),
  hasPhysicalHardwareDependency: z.boolean().optional(),
  latencyRequirementMs: z.number().min(0).optional(),
  isMainframe: z.boolean().optional(),
  cloudLicensingConfirmed: z.boolean().optional(),
  hasLicensingRisk: z.boolean().optional(),
  hasExecutiveSponsor: z.boolean().optional(),
  dependencyMappingComplete: z.boolean().optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

const CarbonWorkloadSchema = z.object({
  name: z.string().describe("Workload or datacentre name"),
  serverCount: z.number().min(1).optional().describe("Number of physical servers running this workload"),
  averageServerWatts: z.number().min(1).optional().describe("Average power consumption per server in watts (default 300W)"),
  datacentrePuE: z.number().min(1).optional().describe("Datacentre PUE ratio (default 1.58 — Uptime Institute 2023 global average)"),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerPortfolioTools(server: McpServer): void {

  // ── generate_portfolio_report ─────────────────────────────────────────────
  server.tool(
    "generate_portfolio_report",
    "Assess and summarise an entire application portfolio for cloud migration. " +
      "Accepts up to 50 workloads, scores each one, then produces a portfolio-level report including: " +
      "readiness summary (Ready / Needs Work / Not Ready counts), " +
      "strategy distribution (how many Rehost / Replatform / Retire / etc.), " +
      "score distribution across 5 bands, top repeated blockers across the portfolio, " +
      "estimated total annual savings, estimated total migration cost, wave count and programme duration. " +
      "Use this for executive briefings, programme planning, and portfolio health checks.",
    {
      workloads: z
        .array(PortfolioWorkloadSchema)
        .min(1)
        .max(50)
        .describe("Portfolio of workloads to assess and summarise"),
    },
    async ({ workloads }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const guardrailsPath = getGuardrailsPath();

      // Score all workloads
      const assessments: MigrationAssessment[] = workloads.map((w) =>
        assessWorkload(w as WorkloadInput, criteriaDoc, guardrailsPath)
      );

      const report = generatePortfolioReport(assessments);

      const lines: string[] = [
        `# Migration Portfolio Report\n`,
        `**Total Workloads:** ${report.totalWorkloads}`,
        `**Estimated Programme Duration:** ${report.estimatedProgrammeDurationWeeks} weeks across ${report.estimatedWaveCount} waves`,
        "",
        `## Readiness Summary`,
        `| Status | Count | % |`,
        `|---|---|---|`,
        `| ✅ Ready | ${report.readySummary.ready} | ${Math.round((report.readySummary.ready / report.totalWorkloads) * 100)}% |`,
        `| ⚠️ Needs Work | ${report.readySummary.needsWork} | ${Math.round((report.readySummary.needsWork / report.totalWorkloads) * 100)}% |`,
        `| ❌ Not Ready | ${report.readySummary.notReady} | ${Math.round((report.readySummary.notReady / report.totalWorkloads) * 100)}% |`,
        "",
        `## Strategy Distribution`,
        `| Strategy | Count | % |`,
        `|---|---|---|`,
        ...report.strategyDistribution.map((s) => `| ${s.strategy} | ${s.count} | ${s.percentage}% |`),
        "",
        `## Score Distribution`,
        `| Band | Count |`,
        `|---|---|`,
        ...report.scoreDistribution.map((b) => `| ${b.band} | ${b.count} |`),
        "",
        `## Financial Estimate (ROM ±50%)`,
        `| | Estimate |`,
        `|---|---|`,
        `| Estimated total migration cost | $${report.estimatedTotalMigrationCostUsd.toLocaleString()} |`,
        `| Estimated annual savings (cloud vs on-prem) | $${report.estimatedTotalAnnualSavingsUsd.toLocaleString()} |`,
        `| Break-even (approx.) | ${Math.ceil(report.estimatedTotalMigrationCostUsd / Math.max(1, report.estimatedTotalAnnualSavingsUsd))} year(s) |`,
        "",
      ];

      if (report.topBlockers.length > 0) {
        lines.push(`## Top Portfolio Blockers\n`);
        for (const b of report.topBlockers) lines.push(`- ${b}`);
        lines.push("");
      }

      lines.push(`## Portfolio Health Notes\n`);
      for (const note of report.portfolioHealthNotes) lines.push(`- ${note}`);
      lines.push("");

      // Per-workload summary table
      lines.push(`## Per-Workload Summary\n`);
      lines.push(`| Workload | Score | Readiness | Strategy | Effort | Risk |`);
      lines.push(`|---|---|---|---|---|---|`);
      for (const a of assessments) {
        const emoji = a.migrationReadiness === "Ready" ? "✅" : a.migrationReadiness === "Needs Work" ? "⚠️" : "❌";
        lines.push(`| ${a.workloadName} | ${a.overallScore} | ${emoji} ${a.migrationReadiness} | ${a.recommendedStrategy} | ${a.estimatedEffort} | ${a.estimatedRisk} |`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── estimate_carbon_impact ─────────────────────────────────────────────────
  server.tool(
    "estimate_carbon_impact",
    "Estimate the carbon footprint reduction from migrating on-premises servers to cloud. " +
      "Compares annual CO2 emissions on-premises (using server count, power consumption, datacentre PUE, and grid carbon intensity) " +
      "vs. equivalent cloud deployment (using hyperscale PUE, utilisation improvements, and cloud provider renewable energy mix). " +
      "Returns on-prem and cloud annual kWh, annual CO2 kg, CO2 reduction %, and equivalent car km removed. " +
      "Sources: IEA 2023, Uptime Institute 2023, AWS/Azure/GCP Sustainability Reports 2023. " +
      "For ESG reporting use cloud provider carbon tools — this is a ROM estimate (±40%).",
    { workload: CarbonWorkloadSchema },
    async ({ workload }) => {
      const report = estimateCarbonImpact(workload as WorkloadInput);

      const lines: string[] = [
        `# Carbon Impact Estimate: ${report.workloadName}\n`,
        `## Carbon Footprint Comparison\n`,
        `| | On-Premises | Cloud | Reduction |`,
        `|---|---|---|---|`,
        `| Annual energy (kWh) | ${report.onPremAnnualKwh.toLocaleString()} | ${report.cloudAnnualKwh.toLocaleString()} | ${(report.onPremAnnualKwh - report.cloudAnnualKwh).toLocaleString()} kWh |`,
        `| Annual CO₂ (kg) | ${report.onPremAnnualCo2Kg.toLocaleString()} | ${report.cloudAnnualCo2Kg.toLocaleString()} | **${report.co2ReductionKg.toLocaleString()} kg (${report.co2ReductionPct}%)** |`,
        "",
        `**CO₂ Reduction Equivalent:** ${report.equivalentCarKmRemoved.toLocaleString()} km of average car travel removed per year`,
        "",
        `## Methodology Notes\n`,
      ];
      for (const note of report.notes) {
        lines.push(`- ${note}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
