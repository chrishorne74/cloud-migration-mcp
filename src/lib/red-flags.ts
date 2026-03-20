import type { WorkloadInput } from "../types/index.js";
import { evaluateRedFlags } from "./red-flags-engine.js";

// ─── Red Flag Severity ────────────────────────────────────────────────────────

export type RedFlagSeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "WARNING";

export interface RedFlag {
  id: string;
  severity: RedFlagSeverity;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  source: string;
}

export interface RedFlagReport {
  workloadName: string;
  overallVerdict: "Proceed" | "Proceed with Caution" | "Defer — Remediate First" | "Do Not Migrate";
  blockerCount: number;
  highCount: number;
  mediumCount: number;
  warningCount: number;
  redFlags: RedFlag[];
  summaryNotes: string[];
}

// ─── Red flag evaluation ──────────────────────────────────────────────────────

export function identifyRedFlags(workload: WorkloadInput): RedFlagReport {
  const flags = evaluateRedFlags(workload);

  const blockers = flags.filter(f => f.severity === "BLOCKER");
  const highs    = flags.filter(f => f.severity === "HIGH");
  const mediums  = flags.filter(f => f.severity === "MEDIUM");
  const warnings = flags.filter(f => f.severity === "WARNING");

  let verdict: RedFlagReport["overallVerdict"];
  if (blockers.length > 0) {
    verdict = "Do Not Migrate";
  } else if (highs.length > 2) {
    verdict = "Defer — Remediate First";
  } else if (highs.length > 0 || mediums.length > 1) {
    verdict = "Proceed with Caution";
  } else {
    verdict = "Proceed";
  }

  const summaryNotes: string[] = [];
  if (blockers.length > 0) {
    summaryNotes.push(`${blockers.length} BLOCKER(s) detected — migration cannot proceed until resolved.`);
  }
  if (highs.length > 0) {
    summaryNotes.push(`${highs.length} HIGH risk flag(s) — pre-migration remediation required.`);
  }
  if (mediums.length > 0) {
    summaryNotes.push(`${mediums.length} MEDIUM risk flag(s) — plan mitigation before wave cutover.`);
  }
  if (flags.length === 0) {
    summaryNotes.push("No red flags detected from provided attributes. Ensure discovery is complete — some red flags require manual investigation.");
  }

  return {
    workloadName: workload.name,
    overallVerdict: verdict,
    blockerCount: blockers.length,
    highCount: highs.length,
    mediumCount: mediums.length,
    warningCount: warnings.length,
    redFlags: flags,
    summaryNotes,
  };
}
