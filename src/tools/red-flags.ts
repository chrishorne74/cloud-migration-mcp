import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { identifyRedFlags } from "../lib/red-flags.js";

// Shared workload schema for red flag triage — mirrors assessment schema with all new fields
const RedFlagWorkloadSchema = z.object({
  name: z.string().describe("Workload / application name"),
  description: z.string().optional(),
  technology: z.string().optional().describe("Primary technology stack"),
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
  attributes: z
    .array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }))
    .optional(),

  // Activity metrics
  cpuUtilisation90DayAvgPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Average CPU utilisation over last 90 days (%). <5% = zombie, 5–20% = idle per AWS MAP."),
  memoryUtilisation90DayAvgPct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Average memory utilisation over last 90 days (%)"),
  hasInboundConnections90Day: z
    .boolean()
    .optional()
    .describe("Has the application received any inbound network connections in the last 90 days?"),

  // Architecture anti-patterns
  architectureAntiPatternCount: z
    .number()
    .min(0)
    .optional()
    .describe("Number of detected code/architecture anti-patterns"),
  hasHardcodedNetworkRefs: z
    .boolean()
    .optional()
    .describe("Does the application have hardcoded IP addresses or server names in code/config?"),
  hasLocalFilesystemDependency: z
    .boolean()
    .optional()
    .describe("Does the application write persistent state to the local filesystem?"),
  hasComDcomDependency: z
    .boolean()
    .optional()
    .describe("Does the application use COM, DCOM, or ActiveX?"),
  hasPhysicalHardwareDependency: z
    .boolean()
    .optional()
    .describe("Does the application depend on physical hardware (dongles, FPGAs, NICs, proprietary storage)?"),
  hasCustomKernelModules: z
    .boolean()
    .optional()
    .describe("Does the application require custom kernel modules?"),

  // Latency
  latencyRequirementMs: z
    .number()
    .min(0)
    .optional()
    .describe("Latency SLA requirement in milliseconds. <1ms = hard blocker for cloud."),

  // Platform flags
  isMainframe: z
    .boolean()
    .optional()
    .describe("Is this a mainframe workload (IBM z/OS, AS/400, Unisys, etc.)?"),
  mainframeLanguages: z
    .array(z.string())
    .optional()
    .describe("Mainframe languages present, e.g. ['COBOL', 'PL/I', 'Assembler', 'Natural', 'Easytrieve']"),
  platform: z
    .string()
    .optional()
    .describe("Non-x86 platform identifier, e.g. 'zOS', 'IBMi', 'Solaris SPARC'"),

  // Database flags
  sqlServerFeatures: z
    .array(
      z.enum([
        "FILESTREAM",
        "FileTable",
        "xp_cmdshell",
        "CLR",
        "LinkedServers",
        "DistributedTransactions",
        "MultipleLogFiles",
      ])
    )
    .optional()
    .describe("SQL Server-specific features in use that may affect managed service eligibility"),
  oracleFeatures: z
    .array(z.enum(["ANYDATA", "IndexOrganisedTables", "StoredProcs", "Triggers", "IOT", "XmlDb"]))
    .optional()
    .describe("Oracle-specific features in use"),
  hasTablesWithoutPrimaryKeys: z
    .boolean()
    .optional()
    .describe("Does any table in scope lack a primary key? Affects DMS replication integrity."),

  // Licensing
  cloudLicensingConfirmed: z
    .boolean()
    .optional()
    .describe("Has the licensing team confirmed cloud deployment rights for all software?"),
  hasLicensingRisk: z
    .boolean()
    .optional()
    .describe("Are there known licences that may prohibit or require renegotiation for cloud?"),

  // Organisational
  hasExecutiveSponsor: z
    .boolean()
    .optional()
    .describe("Is there a confirmed executive sponsor for this workload's migration?"),
  dependencyMappingComplete: z
    .boolean()
    .optional()
    .describe("Has formal dependency mapping been completed for this workload?"),
});

export function registerRedFlagsTools(server: McpServer): void {
  server.tool(
    "identify_red_flags",
    "Triage a workload for migration red flags using industry-standard criteria from AWS MAP, Azure CAF, " +
      "GCP, Gartner, IBM, DXC, TCS, and BMC. " +
      "Returns a structured red flag report with BLOCKER / HIGH / MEDIUM / WARNING severity ratings, " +
      "an overall migration verdict (Proceed / Proceed with Caution / Defer — Remediate First / Do Not Migrate), " +
      "and sourced recommendations for each issue. " +
      "Use this before assess_workload or before committing a workload to a migration wave.",
    { workload: RedFlagWorkloadSchema },
    async ({ workload }) => {
      const report = identifyRedFlags(workload as WorkloadInput);

      const verdictEmoji =
        report.overallVerdict === "Proceed"
          ? "✅"
          : report.overallVerdict === "Proceed with Caution"
          ? "⚠️"
          : report.overallVerdict === "Defer — Remediate First"
          ? "🟠"
          : "🔴";

      const lines: string[] = [
        `# Red Flag Triage: ${report.workloadName}\n`,
        `## Overall Verdict: ${verdictEmoji} ${report.overallVerdict}\n`,
        `| Severity | Count |`,
        `|---|---|`,
        `| 🔴 BLOCKER | ${report.blockerCount} |`,
        `| 🟠 HIGH | ${report.highCount} |`,
        `| 🟡 MEDIUM | ${report.mediumCount} |`,
        `| 🟢 WARNING | ${report.warningCount} |`,
        "",
      ];

      for (const note of report.summaryNotes) {
        lines.push(`> ${note}`);
      }

      if (report.redFlags.length > 0) {
        lines.push("\n## Red Flags\n");

        for (const severity of ["BLOCKER", "HIGH", "MEDIUM", "WARNING"] as const) {
          const flags = report.redFlags.filter((f) => f.severity === severity);
          if (flags.length === 0) continue;

          const emoji =
            severity === "BLOCKER" ? "🔴" : severity === "HIGH" ? "🟠" : severity === "MEDIUM" ? "🟡" : "🟢";

          lines.push(`### ${emoji} ${severity} (${flags.length})\n`);

          for (const flag of flags) {
            lines.push(`#### [${flag.id}] ${flag.title}`);
            lines.push(`**Category:** ${flag.category}`);
            lines.push(`**Detail:** ${flag.detail}`);
            lines.push(`**Recommendation:** ${flag.recommendation}`);
            lines.push(`**Source:** *${flag.source}*`);
            lines.push("");
          }
        }
      } else {
        lines.push(
          "\n✅ No red flags detected from the provided attributes. " +
            "Ensure discovery is complete — some red flags (e.g. hardcoded credentials, batch window conflicts) require manual investigation."
        );
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
