import * as fs from "fs";
import type {
  Guardrail,
  GuardrailCategory,
  GuardrailDocument,
  GuardrailSeverity,
  GuardrailViolation,
  WorkloadInput,
} from "../types/index.js";

// ─── Parser ───────────────────────────────────────────────────────────────────

let _cache: GuardrailDocument | null = null;
let _cachePath = "";

/**
 * Parse the migration guardrails Markdown file.
 *
 * Format per guardrail:
 *   <!-- MG-XXX-NNN | SEVERITY -->
 *   **Rule title**
 *   Description sentence.
 *   Rationale sentence.
 *   Recommendation: action text.
 */
export function parseGuardrailsFile(filePath: string): GuardrailDocument {
  if (!fs.existsSync(filePath)) {
    return { categories: [], totalRules: 0, filePath, lastParsed: new Date() };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);

  const categoryMap = new Map<string, Guardrail[]>();
  let currentCategory = "Uncategorised";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // H2 = category header
    if (/^##\s+/.test(line)) {
      currentCategory = line.replace(/^##\s+/, "").trim();
      i++;
      continue;
    }

    // HTML comment carries the ID and severity
    const commentMatch = line.match(/<!--\s*(MG-[A-Z]+-\d+)\s*\|\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*-->/);
    if (commentMatch) {
      const id = commentMatch[1];
      const severity = commentMatch[2] as GuardrailSeverity;
      i++;

      // Next non-blank line should be **Rule title**
      let rule = "";
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i < lines.length) {
        rule = lines[i].replace(/^\*\*|\*\*$/g, "").trim();
        i++;
      }

      // Collect remaining text until next blank line or comment
      const bodyLines: string[] = [];
      while (
        i < lines.length &&
        !lines[i].startsWith("<!--") &&
        !/^##/.test(lines[i]) &&
        !(lines[i].trim() === "" && bodyLines.length > 0 && lines[i + 1]?.startsWith("<!--"))
      ) {
        bodyLines.push(lines[i]);
        i++;
      }

      // Split body: first non-blank = description, second = rationale, Recommendation: line = recommendation
      const bodyParts = bodyLines.map((l) => l.trim()).filter(Boolean);
      const description = bodyParts[0] ?? "";
      let rationale = bodyParts[1] ?? "";
      let recommendation = "";

      for (const p of bodyParts) {
        if (p.startsWith("Recommendation:")) {
          recommendation = p.replace(/^Recommendation:\s*/, "").trim();
          rationale = bodyParts.find(
            (bp) => bp !== description && !bp.startsWith("Recommendation:")
          ) ?? "";
          break;
        }
      }

      const guardrail: Guardrail = {
        id,
        category: currentCategory as GuardrailCategory,
        severity,
        rule,
        description,
        rationale,
        recommendation,
      };

      if (!categoryMap.has(currentCategory)) categoryMap.set(currentCategory, []);
      categoryMap.get(currentCategory)!.push(guardrail);
      continue;
    }

    i++;
  }

  const categories = Array.from(categoryMap.entries()).map(([name, guardrails]) => ({
    name,
    guardrails,
  }));

  const totalRules = categories.reduce((sum, c) => sum + c.guardrails.length, 0);
  return { categories, totalRules, filePath, lastParsed: new Date() };
}

export function getGuardrailsDocument(filePath: string): GuardrailDocument {
  if (_cache && _cachePath === filePath) return _cache;
  _cache = parseGuardrailsFile(filePath);
  _cachePath = filePath;
  return _cache;
}

export function invalidateCache(): void {
  _cache = null;
  _cachePath = "";
}

// ─── Automated checks ────────────────────────────────────────────────────────

/**
 * Run automated guardrail checks against a WorkloadInput.
 * Returns a list of violations for rules that can be checked programmatically.
 */
export function checkWorkloadGuardrails(
  workload: WorkloadInput,
  doc: GuardrailDocument
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const cat of doc.categories) {
    for (const g of cat.guardrails) {
      const violation = evaluateGuardrail(g, workload);
      if (violation) violations.push(violation);
    }
  }

  return violations;
}

function evaluateGuardrail(
  g: Guardrail,
  w: WorkloadInput
): GuardrailViolation | null {
  switch (g.id) {
    // Security: restricted data must have explicit compliance steps
    case "MG-SEC-005":
      if (w.dataClassification === "restricted") {
        return makeViolation(g, "Workload has Restricted data classification — additional DLP controls required.");
      }
      break;

    // Compliance: data residency — flag if compliance requirements include GDPR etc.
    case "MG-CMP-001":
      if (w.complianceRequirements?.some((r) => /gdpr|privacy|pdpa|pipeda/i.test(r))) {
        return makeViolation(g, "Workload has data residency compliance requirements — target region must be validated.");
      }
      break;

    case "MG-CMP-002":
      if (w.complianceRequirements?.some((r) => /pci/i.test(r))) {
        return makeViolation(g, "Workload is PCI-DSS in-scope — QSA review required before migration.");
      }
      break;

    case "MG-CMP-003":
      if (w.complianceRequirements?.some((r) => /hipaa/i.test(r))) {
        return makeViolation(g, "Workload processes ePHI — BAA with cloud provider must be confirmed.");
      }
      break;

    // Cost: right-sizing
    case "MG-CST-002":
      if (!w.attributes?.some((a) => a.name === "utilizationDataCollected") && w.cpuUtilisation90DayAvgPct === undefined) {
        return makeViolation(g, "No utilisation data collected — right-sizing cannot be performed without performance metrics.");
      }
      break;

    // Data: large dataset
    case "MG-DAT-004": {
      const sizeAttr = w.attributes?.find((a) => a.name === "dataSizeTB");
      if (sizeAttr && Number(sizeAttr.value) > 10) {
        return makeViolation(
          g,
          `Dataset size ${sizeAttr.value} TB exceeds 10 TB threshold — offline transfer required.`
        );
      }
      break;
    }

    // Security: secrets
    case "MG-SEC-003":
      if (w.attributes?.some((a) => a.name === "hasHardcodedCredentials" && a.value === true)) {
        return makeViolation(g, "Workload has been flagged as containing hardcoded credentials — must be remediated before migration.");
      }
      break;

    // Technical Red Flags — new checks

    // Physical hardware dependency
    case "MG-TRF-001":
      if (w.hasPhysicalHardwareDependency === true) {
        return makeViolation(g, "Workload has a physical hardware dependency (dongle, FPGA, proprietary storage, etc.) — cannot migrate to standard IaaS.");
      }
      break;

    // Sub-millisecond latency
    case "MG-TRF-002":
      if (w.latencyRequirementMs !== undefined && w.latencyRequirementMs < 1) {
        return makeViolation(g, `Workload requires ${w.latencyRequirementMs}ms latency — incompatible with cloud network topology.`);
      }
      break;

    // Hardcoded network references
    case "MG-TRF-006":
      if (w.hasHardcodedNetworkRefs === true) {
        return makeViolation(g, "Hardcoded IP addresses or server names detected — application will fail post-migration without remediation.");
      }
      break;

    // Local filesystem dependency
    case "MG-TRF-007":
      if (w.hasLocalFilesystemDependency === true) {
        return makeViolation(g, "Application writes persistent state to local filesystem — incompatible with containerisation and auto-scaling.");
      }
      break;

    // COM/DCOM dependency
    case "MG-TRF-008":
      if (w.hasComDcomDependency === true) {
        return makeViolation(g, "COM/DCOM/ActiveX dependency detected — limits migration to Windows IaaS only, blocks containerisation.");
      }
      break;

    // Zombie workload
    case "MG-TRF-009":
      if (
        w.cpuUtilisation90DayAvgPct !== undefined &&
        w.cpuUtilisation90DayAvgPct < 5 &&
        w.hasInboundConnections90Day === false
      ) {
        return makeViolation(
          g,
          `Zombie workload: ${w.cpuUtilisation90DayAvgPct}% CPU, no inbound connections in 90 days — evaluate for Retire before migration.`
        );
      }
      break;

    // Mainframe workload
    case "MG-TRF-011":
      if (w.isMainframe === true) {
        const langs = w.mainframeLanguages?.length ? ` Languages: ${w.mainframeLanguages.join(", ")}.` : "";
        return makeViolation(g, `Mainframe workload detected.${langs} Requires specialist assessment — do not include in standard migration wave.`);
      }
      break;

    // Licensing not confirmed
    case "MG-TRF-004":
      if (w.cloudLicensingConfirmed === false || w.hasLicensingRisk === true) {
        return makeViolation(g, "Cloud licensing rights not confirmed or licensing risk identified — do not migrate until licensing team sign-off obtained.");
      }
      break;

    // Organisational Red Flags

    // No executive sponsor
    case "MG-ORG-002":
      if (w.hasExecutiveSponsor === false) {
        return makeViolation(g, "No confirmed executive sponsor — migrations without sponsorship experience unresolvable blockers and scope instability.");
      }
      break;

    // Dependency mapping incomplete
    case "MG-ORG-007":
      if (w.dependencyMappingComplete === false) {
        return makeViolation(g, "Dependency mapping not complete — wave plan cannot be finalised. 38% of failed projects cite undiscovered dependency conflicts.");
      }
      break;

    // Database Migration Red Flags

    // SQL Server FILESTREAM/FileTable
    case "MG-DB-001":
      if (w.sqlServerFeatures?.includes("FILESTREAM") || w.sqlServerFeatures?.includes("FileTable")) {
        const features = (w.sqlServerFeatures ?? []).filter((f) => f === "FILESTREAM" || f === "FileTable");
        return makeViolation(g, `SQL Server ${features.join("/")} detected — cannot be restored to Azure SQL Managed Instance. Migrate to SQL Server on VM instead.`);
      }
      break;

    // Tables without primary keys
    case "MG-DB-002":
      if (w.hasTablesWithoutPrimaryKeys === true) {
        return makeViolation(g, "Tables without primary keys detected — DMS replication may produce silent data integrity failures. Add PKs or configure supplemental logging before DMS.");
      }
      break;

    // Oracle ANYDATA
    case "MG-DB-003":
      if (w.oracleFeatures?.includes("ANYDATA")) {
        return makeViolation(g, "Oracle ANYDATA type detected — completely unsupported by GCP DMS. Affected tables cannot be replicated; plan bulk export/import for these tables.");
      }
      break;

    // Oracle Index-Organised Tables
    case "MG-DB-004":
      if (w.oracleFeatures?.includes("IndexOrganisedTables") || w.oracleFeatures?.includes("IOT")) {
        return makeViolation(g, "Oracle Index-Organised Tables (IOTs) detected — not supported by GCP DMS. Plan bulk migration for IOT tables outside the replication stream.");
      }
      break;
  }

  return null;
}

function makeViolation(g: Guardrail, detail: string): GuardrailViolation {
  return {
    guardrailId: g.id,
    rule: g.rule,
    severity: g.severity,
    category: g.category,
    detail,
    recommendation: g.recommendation,
  };
}

// ─── Write helpers (for add/update/delete guardrail tools) ───────────────────

export function appendGuardrailToFile(filePath: string, guardrail: Guardrail): void {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";

  // Ensure Custom section exists
  if (!content.includes("## Custom")) {
    content += "\n\n## Custom\n";
  }

  const block = `\n<!-- ${guardrail.id} | ${guardrail.severity} -->\n**${guardrail.rule}**\n${guardrail.description}\n${guardrail.rationale}\nRecommendation: ${guardrail.recommendation}\n`;

  // Insert before last blank lines / end of file
  const customIdx = content.lastIndexOf("## Custom");
  const insertAt = content.length;
  content = content.slice(0, insertAt) + block;

  void customIdx; // used for section awareness
  fs.writeFileSync(filePath, content, "utf-8");
  invalidateCache();
}

export function updateGuardrailInFile(
  filePath: string,
  id: string,
  updates: Partial<Pick<Guardrail, "rule" | "description" | "rationale" | "recommendation" | "severity">>
): boolean {
  if (!fs.existsSync(filePath)) return false;
  let content = fs.readFileSync(filePath, "utf-8");

  // Find the comment line for this ID
  const commentRegex = new RegExp(`<!--\\s*${id}\\s*\\|\\s*(CRITICAL|HIGH|MEDIUM|LOW)\\s*-->`);
  if (!commentRegex.test(content)) return false;

  if (updates.severity) {
    content = content.replace(commentRegex, `<!-- ${id} | ${updates.severity} -->`);
  }

  if (updates.rule) {
    // Replace the bold line immediately after the comment
    content = content.replace(
      new RegExp(`(<!--\\s*${id}\\s*\\|[^>]+-->\\s*\\n)\\*\\*[^*]+\\*\\*`),
      `$1**${updates.rule}**`
    );
  }

  fs.writeFileSync(filePath, content, "utf-8");
  invalidateCache();
  return true;
}

export function deleteGuardrailFromFile(filePath: string, id: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf-8");

  // Remove the block from <!-- ID ... --> through the next blank line
  const pattern = new RegExp(
    `\\n<!-- ${id} \\|[^>]+-->\\n(?:\\*\\*[^\\n]+\\*\\*\\n)?(?:[^\\n]+\\n)*\\n?`,
    "g"
  );
  const updated = content.replace(pattern, "\n");
  if (updated === content) return false;

  fs.writeFileSync(filePath, updated, "utf-8");
  invalidateCache();
  return true;
}
