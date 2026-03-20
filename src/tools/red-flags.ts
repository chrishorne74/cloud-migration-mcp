import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { identifyRedFlags } from "../lib/red-flags.js";
import {
  listRedFlagDefinitions,
  addRedFlagToFile,
  updateRedFlagInFile,
  deleteRedFlagFromFile,
  reloadRedFlags,
} from "../lib/red-flags-engine.js";

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

  // ── list_red_flags ──────────────────────────────────────────────────────────

  server.tool(
    "list_red_flags",
    "List all red flag definitions loaded from the active red flags JSON file, grouped by severity. " +
      "Shows ID, severity, category, title, and condition for each flag. " +
      "Use this to review what flags are configured before adding or modifying flags.",
    {},
    async () => {
      const { definitions, filePath, count } = listRedFlagDefinitions();

      const lines: string[] = [
        `# Migration Red Flags — ${count} definitions\n`,
        `**Source file:** \`${filePath}\`\n`,
      ];

      for (const sev of ["BLOCKER", "HIGH", "MEDIUM", "WARNING"] as const) {
        const group = definitions.filter(d => d.severity === sev);
        if (group.length === 0) continue;
        const emoji = sev === "BLOCKER" ? "🔴" : sev === "HIGH" ? "🟠" : sev === "MEDIUM" ? "🟡" : "🟢";
        lines.push(`## ${emoji} ${sev} (${group.length})\n`);
        for (const d of group) {
          lines.push(`- **[${d.id}]** ${d.title} *(${d.category})*`);
        }
        lines.push("");
      }

      lines.push(
        "\nTo add a custom flag use `add_red_flag`. " +
        "To modify severity or text use `update_red_flag`. " +
        "To remove a flag use `delete_red_flag`. " +
        "After manually editing the file, call `reload_red_flags` to apply changes."
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── add_red_flag ────────────────────────────────────────────────────────────

  const ConditionSchema = z.record(z.unknown()).describe(
    "JSON condition expression. Simple: {\"attribute\":\"fieldName\",\"operator\":\"eq\",\"value\":true}. " +
    "Compound: {\"and\":[...]} or {\"or\":[...]}. " +
    "Operators: eq, neq, lt, lte, gt, gte, includes, notIncludes, defined, undefined, includesMatch."
  );

  server.tool(
    "add_red_flag",
    "Add a new organisation-specific red flag to the active red flags JSON file. " +
      "The flag will be evaluated against workload attributes during identify_red_flags calls. " +
      "Supply a unique ID (e.g. RF-HIGH-ORG-001), severity, category, title, detail, recommendation, source, and a condition expression.",
    {
      id: z.string().describe("Unique flag ID, e.g. RF-HIGH-ORG-001"),
      severity: z.enum(["BLOCKER", "HIGH", "MEDIUM", "WARNING"]),
      category: z.string().describe("Category label, e.g. Technical, Database, Licensing, Organisational"),
      title: z.string().describe("Short title for the red flag"),
      detail: z.string().describe("Detailed explanation of the risk"),
      recommendation: z.string().describe("Recommended remediation action"),
      source: z.string().describe("Source reference (standard, guidance document, etc.)"),
      condition: ConditionSchema,
    },
    async ({ id, severity, category, title, detail, recommendation, source, condition }) => {
      const { added, filePath } = addRedFlagToFile({
        id, severity, category, title, detail, recommendation, source,
        condition: condition as unknown as Parameters<typeof addRedFlagToFile>[0]["condition"],
      });
      return {
        content: [{
          type: "text",
          text: `✅ Red flag **${added.id}** added to \`${filePath}\`.\n\nIt will be evaluated on the next \`identify_red_flags\` call.`,
        }],
      };
    }
  );

  // ── update_red_flag ─────────────────────────────────────────────────────────

  server.tool(
    "update_red_flag",
    "Update an existing red flag's severity, title, detail, recommendation, source, or condition. " +
      "Supply the flag ID and only the fields you want to change.",
    {
      id: z.string().describe("ID of the red flag to update"),
      severity: z.enum(["BLOCKER", "HIGH", "MEDIUM", "WARNING"]).optional(),
      category: z.string().optional(),
      title: z.string().optional(),
      detail: z.string().optional(),
      recommendation: z.string().optional(),
      source: z.string().optional(),
      condition: ConditionSchema.optional(),
    },
    async ({ id, ...updates }) => {
      const { updated, filePath } = updateRedFlagInFile(id, updates as Parameters<typeof updateRedFlagInFile>[1]);
      return {
        content: [{
          type: "text",
          text: `✅ Red flag **${updated.id}** updated in \`${filePath}\`.\n\n**Title:** ${updated.title}\n**Severity:** ${updated.severity}`,
        }],
      };
    }
  );

  // ── delete_red_flag ─────────────────────────────────────────────────────────

  server.tool(
    "delete_red_flag",
    "Delete a red flag from the active red flags JSON file by ID. " +
      "Built-in flags can be deleted if they are not applicable to your organisation. " +
      "Use reload_red_flags after manually restoring deleted flags.",
    {
      id: z.string().describe("ID of the red flag to delete, e.g. RF-HIGH-001"),
    },
    async ({ id }) => {
      const { deleted, filePath } = deleteRedFlagFromFile(id);
      return {
        content: [{
          type: "text",
          text: `✅ Red flag **${deleted}** deleted from \`${filePath}\`.`,
        }],
      };
    }
  );

  // ── reload_red_flags ────────────────────────────────────────────────────────

  server.tool(
    "reload_red_flags",
    "Reload the red flags JSON file from disk, clearing the in-memory cache. " +
      "Use this after manually editing the red flags file to apply changes without restarting the server.",
    {},
    async () => {
      const { loaded, filePath } = reloadRedFlags();
      return {
        content: [{
          type: "text",
          text: `✅ Red flags reloaded from \`${filePath}\` — **${loaded}** definitions active.`,
        }],
      };
    }
  );
}
