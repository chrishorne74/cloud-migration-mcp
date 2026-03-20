import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { assessDatabaseMigration } from "../lib/database-migration.js";

const DatabaseWorkloadSchema = z.object({
  name: z.string().describe("Database / workload name"),
  database: z.string().optional().describe("Source database engine, e.g. 'Oracle 12c', 'SQL Server 2016', 'MySQL 8.0', 'PostgreSQL 14'"),
  databaseVersion: z.string().optional().describe("Database version string if not included in the database field"),
  technology: z.string().optional().describe("Application technology if database field is not provided"),
  databaseSizeGb: z.number().min(0).optional().describe("Approximate database size in GB"),
  databaseDowntimeTolerance: z.enum(["zero", "minutes", "hours", "days"]).optional()
    .describe("Maximum acceptable downtime during migration: zero (CDC required), minutes, hours, or days"),
  requiresContinuousReplication: z.boolean().optional()
    .describe("Is continuous replication (CDC) required to minimise cutover downtime?"),
  targetDatabaseEngine: z.string().optional()
    .describe("Desired target engine, e.g. 'Aurora PostgreSQL', 'RDS SQL Server', 'Cloud SQL for MySQL'"),
  storedProcedureCount: z.number().min(0).optional()
    .describe("Approximate number of stored procedures and triggers in scope"),
  sqlServerFeatures: z
    .array(z.enum(["FILESTREAM", "FileTable", "xp_cmdshell", "CLR", "LinkedServers", "DistributedTransactions", "MultipleLogFiles"]))
    .optional(),
  oracleFeatures: z
    .array(z.enum(["ANYDATA", "IndexOrganisedTables", "StoredProcs", "Triggers", "IOT", "XmlDb"]))
    .optional(),
  hasTablesWithoutPrimaryKeys: z.boolean().optional()
    .describe("Do any tables in scope lack a primary key? Affects DMS CDC replication integrity."),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  complianceRequirements: z.array(z.string()).optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerDatabaseTools(server: McpServer): void {
  server.tool(
    "assess_database_migration",
    "Assess a database workload for cloud migration: determine homogeneous vs. heterogeneous migration path, " +
      "recommend target engine and migration tools (AWS DMS, Schema Conversion Tool, Azure DMS, GCP DMS, Oracle Data Pump, etc.), " +
      "select the appropriate downtime model (CDC near-zero / full cutover / snapshot), " +
      "identify database-specific risks (FILESTREAM, Oracle ANYDATA, tables without PKs, large datasets), " +
      "and produce pre-migration and post-migration checklists. " +
      "Supports SQL Server, Oracle, MySQL, PostgreSQL, MariaDB, MongoDB, DB2, Sybase, Cassandra.",
    { workload: DatabaseWorkloadSchema },
    async ({ workload }) => {
      const assessment = assessDatabaseMigration(workload as WorkloadInput);

      const pathEmoji = assessment.migrationPath === "Homogeneous" ? "🟢" : assessment.migrationPath === "Near-Homogeneous" ? "🟡" : "🟠";
      const riskEmoji = (s: string) => s === "CRITICAL" ? "🔴" : s === "HIGH" ? "🟠" : s === "MEDIUM" ? "🟡" : "🟢";

      const lines: string[] = [
        `# Database Migration Assessment: ${assessment.databaseName}\n`,
        `## Migration Path`,
        `${pathEmoji} **Path Type:** ${assessment.migrationPath}`,
        `**Source Engine:** ${assessment.sourceEngine}`,
        `**Recommended Target:** ${assessment.recommendedTarget}`,
        `**Schema Conversion Required:** ${assessment.schemaConversionRequired ? "Yes" : "No"}`,
        `**Conversion Effort:** ${assessment.estimatedConversionEffort}`,
        `**Downtime Model:** ${assessment.downtimeModel}`,
        `**Estimated Migration Duration:** ${assessment.estimatedMigrationWeeks} week${assessment.estimatedMigrationWeeks !== 1 ? "s" : ""}`,
        "",
        `**Migration Tools:** ${assessment.migrationTools.join(", ")}`,
        "",
      ];

      if (assessment.risks.length > 0) {
        lines.push(`## ⚠️ Migration Risks (${assessment.risks.length})\n`);
        for (const risk of assessment.risks) {
          lines.push(`### ${riskEmoji(risk.severity)} [${risk.id}] ${risk.severity} — ${risk.description}`);
          lines.push(`**Mitigation:** ${risk.mitigation}`);
          lines.push("");
        }
      }

      lines.push("## Pre-Migration Checklist\n");
      for (let i = 0; i < assessment.preChecklist.length; i++) {
        lines.push(`- [ ] ${assessment.preChecklist[i]}`);
      }

      lines.push("\n## Post-Migration Checklist\n");
      for (const item of assessment.postChecklist) {
        lines.push(`- [ ] ${item}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
