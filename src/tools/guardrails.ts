import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Guardrail, GuardrailCategory, GuardrailSeverity } from "../types/index.js";
import {
  appendGuardrailToFile,
  deleteGuardrailFromFile,
  getGuardrailsDocument,
  invalidateCache,
  parseGuardrailsFile,
  updateGuardrailInFile,
} from "../lib/guardrails-engine.js";

export function getGuardrailsPath(): string {
  const override = (process.env["USER_GUARDRAILS_FILE"] ?? "").trim();
  if (override) return override;
  return (process.env["GUARDRAILS_FILE"] ?? "").trim() || "./guardrails/migration-guardrails.md";
}

export function registerGuardrailsTools(server: McpServer): void {

  // ── list_migration_guardrails ─────────────────────────────────────────────
  server.tool(
    "list_migration_guardrails",
    "List all cloud migration guardrails organised by category. " +
      "These rules govern how workloads must be assessed, grouped, and migrated. " +
      "Filter by category (Dependency, Security, Compliance, Data, Architecture, Operations, Cost, Custom) or severity.",
    {
      category: z.string().optional().describe("Filter by category name (case-insensitive)"),
      severity: z
        .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])
        .optional()
        .describe("Filter by severity level"),
    },
    async ({ category, severity }) => {
      const doc = getGuardrailsDocument(getGuardrailsPath());

      let cats = category
        ? doc.categories.filter((c) => c.name.toLowerCase().includes(category.toLowerCase()))
        : doc.categories;

      if (severity) {
        cats = cats
          .map((c) => ({
            ...c,
            guardrails: c.guardrails.filter((g) => g.severity === severity),
          }))
          .filter((c) => c.guardrails.length > 0);
      }

      if (cats.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No guardrails found matching the filter.`,
            },
          ],
        };
      }

      const lines: string[] = [
        `# Cloud Migration Guardrails\n`,
        `**Total rules loaded:** ${doc.totalRules} | **Last parsed:** ${doc.lastParsed.toISOString()}\n`,
        `**Source:** \`${doc.filePath}\`\n`,
      ];

      for (const cat of cats) {
        lines.push(`\n## ${cat.name} (${cat.guardrails.length} rules)`);
        for (const g of cat.guardrails) {
          const sev =
            g.severity === "CRITICAL" ? "🔴"
            : g.severity === "HIGH" ? "🟠"
            : g.severity === "MEDIUM" ? "🟡"
            : "🟢";
          lines.push(`\n### [${g.id}] ${sev} ${g.severity} — ${g.rule}`);
          lines.push(`${g.description}`);
          if (g.rationale) lines.push(`*Rationale:* ${g.rationale}`);
          lines.push(`*Recommendation:* ${g.recommendation}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ── add_migration_guardrail ───────────────────────────────────────────────
  server.tool(
    "add_migration_guardrail",
    "Add a new migration guardrail rule to the guardrails file. " +
      "New guardrails are appended to the Custom category and take effect immediately.",
    {
      id: z.string().describe("Unique guardrail ID, e.g. MG-CUS-002"),
      category: z
        .enum(["Dependency", "Security", "Compliance", "Data", "Architecture", "Operations", "Cost", "Custom"])
        .describe("Guardrail category"),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).describe("Severity level"),
      rule: z.string().describe("Short rule title (will appear in bold)"),
      description: z.string().describe("What the rule requires"),
      rationale: z.string().optional().describe("Why this rule exists"),
      recommendation: z.string().describe("How to comply with this rule"),
    },
    async ({ id, category, severity, rule, description, rationale, recommendation }) => {
      const path = getGuardrailsPath();
      const doc = getGuardrailsDocument(path);

      // Check for duplicate ID
      const allGuardrails = doc.categories.flatMap((c) => c.guardrails);
      if (allGuardrails.some((g) => g.id === id)) {
        return {
          content: [{ type: "text", text: `❌ Guardrail ID \`${id}\` already exists. Use update_migration_guardrail to modify it.` }],
          isError: true,
        };
      }

      const guardrail: Guardrail = {
        id,
        category: category as GuardrailCategory,
        severity: severity as GuardrailSeverity,
        rule,
        description,
        rationale: rationale ?? "",
        recommendation,
      };

      appendGuardrailToFile(path, guardrail);

      return {
        content: [
          {
            type: "text",
            text: `✅ Guardrail **[${id}]** added to \`${path}\`.\n\n**Rule:** ${rule}\n**Category:** ${category} | **Severity:** ${severity}\n\nUse \`reload_migration_guardrails\` if changes do not appear immediately.`,
          },
        ],
      };
    }
  );

  // ── update_migration_guardrail ────────────────────────────────────────────
  server.tool(
    "update_migration_guardrail",
    "Update the severity or rule text of an existing migration guardrail by ID.",
    {
      id: z.string().describe("Guardrail ID to update, e.g. MG-CUS-001"),
      severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().describe("New severity"),
      rule: z.string().optional().describe("New rule title"),
      description: z.string().optional().describe("New description"),
      recommendation: z.string().optional().describe("New recommendation"),
    },
    async ({ id, severity, rule, description, recommendation }) => {
      const path = getGuardrailsPath();
      const updated = updateGuardrailInFile(path, id, { severity, rule, description, recommendation });

      if (!updated) {
        return {
          content: [{ type: "text", text: `❌ Guardrail ID \`${id}\` not found in \`${path}\`.` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ Guardrail **[${id}]** updated in \`${path}\`. Run \`reload_migration_guardrails\` to apply.`,
          },
        ],
      };
    }
  );

  // ── delete_migration_guardrail ────────────────────────────────────────────
  server.tool(
    "delete_migration_guardrail",
    "Permanently delete a migration guardrail by ID from the guardrails file.",
    {
      id: z.string().describe("Guardrail ID to delete, e.g. MG-CUS-001"),
    },
    async ({ id }) => {
      const path = getGuardrailsPath();
      const deleted = deleteGuardrailFromFile(path, id);

      if (!deleted) {
        return {
          content: [{ type: "text", text: `❌ Guardrail \`${id}\` not found.` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `✅ Guardrail **[${id}]** deleted from \`${path}\`.` }],
      };
    }
  );

  // ── reload_migration_guardrails ───────────────────────────────────────────
  server.tool(
    "reload_migration_guardrails",
    "Force reload of the migration guardrails file. Use after manually editing the file.",
    {},
    async () => {
      invalidateCache();
      const doc = parseGuardrailsFile(getGuardrailsPath());
      const cats = doc.categories.map((c) => `${c.name} (${c.guardrails.length} rules)`);

      return {
        content: [
          {
            type: "text",
            text:
              `✅ Migration guardrails reloaded from \`${doc.filePath}\`\n\n` +
              `**Total rules:** ${doc.totalRules}\n\n` +
              `**Categories:**\n${cats.map((c) => `- ${c}`).join("\n")}`,
          },
        ],
      };
    }
  );
}
