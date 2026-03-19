import * as fs from "fs";
import type {
  CriterionScore,
  MigrationAssessment,
  ScoringCriteriaDocument,
  ScoringCriterion,
  WorkloadInput,
} from "../types/index.js";
import { checkWorkloadGuardrails, getGuardrailsDocument } from "./guardrails-engine.js";
import { recommendStrategy } from "./seven-rs.js";

// ─── Criteria store ───────────────────────────────────────────────────────────

let _criteriaCache: ScoringCriteriaDocument | null = null;
let _criteriaCachePath = "";

export function loadCriteria(filePath: string): ScoringCriteriaDocument {
  if (_criteriaCache && _criteriaCachePath === filePath) return _criteriaCache;

  if (!fs.existsSync(filePath)) {
    _criteriaCache = { criteria: [], totalWeight: 0, filePath, lastParsed: new Date() };
    _criteriaCachePath = filePath;
    return _criteriaCache;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { criteria: ScoringCriterion[] };
  const totalWeight = raw.criteria.reduce((s, c) => s + c.weight, 0);
  _criteriaCache = { criteria: raw.criteria, totalWeight, filePath, lastParsed: new Date() };
  _criteriaCachePath = filePath;
  return _criteriaCache;
}

export function invalidateCriteriaCache(): void {
  _criteriaCache = null;
  _criteriaCachePath = "";
}

export function saveCriteria(doc: ScoringCriteriaDocument): void {
  const data = { version: "1.0", criteria: doc.criteria };
  fs.writeFileSync(doc.filePath, JSON.stringify(data, null, 2), "utf-8");
  invalidateCriteriaCache();
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

export function scoreWorkload(
  workload: WorkloadInput,
  criteriaDoc: ScoringCriteriaDocument
): CriterionScore[] {
  return criteriaDoc.criteria.map((c) => {
    const { score, rationale } = computeCriterionScore(c, workload);
    const weighted = (score * c.weight) / criteriaDoc.totalWeight;
    return {
      criterionId: c.id,
      criterionName: c.name,
      score,
      weight: c.weight,
      weightedScore: Math.round(weighted * 100) / 100,
      rationale,
    };
  });
}

function computeCriterionScore(
  c: ScoringCriterion,
  w: WorkloadInput
): { score: number; rationale: string } {
  const attr = c.workloadAttribute ? w[c.workloadAttribute] : undefined;

  if (attr === undefined || attr === null) {
    return { score: 50, rationale: "Not provided — defaulting to neutral score of 50." };
  }

  // Numeric bands
  if (c.bands && typeof attr === "number") {
    for (const band of c.bands) {
      if (attr <= band.max) {
        return { score: band.score, rationale: band.label };
      }
    }
    return { score: 50, rationale: "Value outside defined bands." };
  }

  // Boolean attributes
  if (typeof attr === "boolean") {
    return handleBoolean(c, attr);
  }

  // String attributes (dataClassification, documentationLevel)
  if (typeof attr === "string") {
    return handleString(c, attr);
  }

  // Array attributes (complianceRequirements)
  if (Array.isArray(attr)) {
    const len = (attr as unknown[]).length;
    if (c.id === "CRIT-010") {
      const bands: [number, number, string][] = [
        [0, 100, "No compliance requirements"],
        [1, 75, "1 compliance requirement"],
        [2, 50, "2 compliance requirements"],
      ];
      for (const [max, score, label] of bands) {
        if (len <= max) return { score, rationale: label };
      }
      return { score: 20, rationale: `${len} compliance requirements — high compliance overhead` };
    }
  }

  return { score: 50, rationale: "Unable to compute score for this attribute type." };
}

function handleBoolean(
  c: ScoringCriterion,
  value: boolean
): { score: number; rationale: string } {
  switch (c.id) {
    case "CRIT-003":
      return value
        ? { score: 60, rationale: "Vendor actively supporting — reduces urgency but also reduces migration risk" }
        : { score: 100, rationale: "Vendor support ended — strong migration driver" };
    case "CRIT-004":
      return value
        ? { score: 80, rationale: "Source code available — enables replatform/refactor options" }
        : { score: 30, rationale: "Source code unavailable — limits strategy options to Rehost or Repurchase" };
    case "CRIT-007":
      return value
        ? { score: 90, rationale: "SaaS alternative exists — Repurchase strategy viable" }
        : { score: 50, rationale: "No SaaS alternative identified" };
    default:
      return { score: value ? 75 : 25, rationale: value ? "Yes" : "No" };
  }
}

function handleString(
  c: ScoringCriterion,
  value: string
): { score: number; rationale: string } {
  if (c.id === "CRIT-008") {
    const map: Record<string, [number, string]> = {
      public: [100, "Public data — no special controls needed"],
      internal: [75, "Internal data — standard controls apply"],
      confidential: [40, "Confidential data — additional controls required"],
      restricted: [15, "Restricted/PII data — high compliance overhead"],
    };
    const entry = map[value.toLowerCase()];
    return entry
      ? { score: entry[0], rationale: entry[1] }
      : { score: 50, rationale: `Unknown classification: ${value}` };
  }

  if (c.id === "CRIT-009") {
    const map: Record<string, [number, string]> = {
      high: [90, "Well documented — low discovery risk"],
      medium: [60, "Moderately documented — some discovery effort needed"],
      low: [25, "Poorly documented — high discovery and migration risk"],
    };
    const entry = map[value.toLowerCase()];
    return entry
      ? { score: entry[0], rationale: entry[1] }
      : { score: 50, rationale: `Unknown documentation level: ${value}` };
  }

  return { score: 50, rationale: `Value: ${value}` };
}

// ─── Full assessment ──────────────────────────────────────────────────────────

export function assessWorkload(
  workload: WorkloadInput,
  criteriaDoc: ScoringCriteriaDocument,
  guardrailsPath: string
): MigrationAssessment {
  const criterionScores = scoreWorkload(workload, criteriaDoc);

  // Weighted overall score (0-100)
  const totalWeightedScore = criterionScores.reduce((s, c) => s + c.weightedScore, 0);
  const overallScore = Math.round(
    (totalWeightedScore / criteriaDoc.criteria.reduce((s, c) => s + c.weight, 0)) * 100
  );
  // Normalise to 0-100
  const normalisedScore = Math.min(100, Math.max(0, overallScore));

  const readiness: MigrationAssessment["migrationReadiness"] =
    normalisedScore >= 65 ? "Ready"
    : normalisedScore >= 40 ? "Needs Work"
    : "Not Ready";

  const guardrailsDoc = getGuardrailsDocument(guardrailsPath);
  const guardrailViolations = checkWorkloadGuardrails(workload, guardrailsDoc);

  const { primary, alternatives, rationale } = recommendStrategy(workload, normalisedScore);

  // Effort and risk estimation
  const complexityScore = criterionScores.find((c) => c.criterionId === "CRIT-002")?.score ?? 50;
  const estimatedEffort: MigrationAssessment["estimatedEffort"] =
    complexityScore >= 70 ? "Low" : complexityScore >= 40 ? "Medium" : "High";

  const criticalViolations = guardrailViolations.filter((v) => v.severity === "CRITICAL").length;
  const highViolations = guardrailViolations.filter((v) => v.severity === "HIGH").length;
  const estimatedRisk: MigrationAssessment["estimatedRisk"] =
    criticalViolations > 0 ? "High"
    : highViolations > 1 ? "High"
    : highViolations > 0 ? "Medium"
    : "Low";

  // Key findings
  const keyFindings: string[] = [];
  if (normalisedScore >= 65) keyFindings.push("Workload is a strong migration candidate.");
  if (normalisedScore < 40) keyFindings.push("Workload has significant barriers to migration — consider Retain or Retire.");
  if (guardrailViolations.length > 0) keyFindings.push(`${guardrailViolations.length} guardrail violation(s) detected — must be resolved before migration.`);
  if (!workload.sourceCodeAvailable) keyFindings.push("No source code — strategy options limited to Rehost, Relocate, or Repurchase.");
  if (workload.saasAlternativeExists) keyFindings.push("SaaS alternative exists — evaluate Repurchase strategy.");
  if (!workload.vendorSupportActive) keyFindings.push("Vendor support has ended — migration urgency is elevated.");

  const recommendations = rationale;

  return {
    workloadName: workload.name,
    overallScore: normalisedScore,
    migrationReadiness: readiness,
    recommendedStrategy: primary,
    alternativeStrategies: alternatives,
    criterionScores,
    guardrailViolations,
    estimatedEffort,
    estimatedRisk,
    keyFindings,
    recommendations,
  };
}

// ─── Rank multiple workloads ──────────────────────────────────────────────────

export interface RankedWorkload {
  rank: number;
  workloadName: string;
  overallScore: number;
  migrationReadiness: string;
  recommendedStrategy: string;
  estimatedEffort: string;
  estimatedRisk: string;
  keyFindings: string[];
}

export function rankWorkloads(
  workloads: WorkloadInput[],
  criteriaDoc: ScoringCriteriaDocument,
  guardrailsPath: string
): RankedWorkload[] {
  const assessments = workloads.map((w) => assessWorkload(w, criteriaDoc, guardrailsPath));
  assessments.sort((a, b) => b.overallScore - a.overallScore);

  return assessments.map((a, idx) => ({
    rank: idx + 1,
    workloadName: a.workloadName,
    overallScore: a.overallScore,
    migrationReadiness: a.migrationReadiness,
    recommendedStrategy: a.recommendedStrategy,
    estimatedEffort: a.estimatedEffort,
    estimatedRisk: a.estimatedRisk,
    keyFindings: a.keyFindings,
  }));
}
