import type {
  MigrationAssessment,
  MigrationStrategy,
  PortfolioReport,
  StrategyDistribution,
} from "../types/index.js";

// ─── Portfolio report ─────────────────────────────────────────────────────────

export function generatePortfolioReport(assessments: MigrationAssessment[]): PortfolioReport {
  const total = assessments.length;
  if (total === 0) {
    return {
      totalWorkloads: 0,
      readySummary: { ready: 0, needsWork: 0, notReady: 0 },
      strategyDistribution: [],
      scoreDistribution: [],
      topBlockers: [],
      estimatedTotalAnnualSavingsUsd: 0,
      estimatedTotalMigrationCostUsd: 0,
      estimatedWaveCount: 0,
      estimatedProgrammeDurationWeeks: 0,
      portfolioHealthNotes: ["No workloads provided."],
    };
  }

  // ── Readiness summary ─────────────────────────────────────────────────────
  const ready = assessments.filter((a) => a.migrationReadiness === "Ready").length;
  const needsWork = assessments.filter((a) => a.migrationReadiness === "Needs Work").length;
  const notReady = assessments.filter((a) => a.migrationReadiness === "Not Ready").length;

  // ── Strategy distribution ─────────────────────────────────────────────────
  const strategyCounts = new Map<MigrationStrategy, number>();
  for (const a of assessments) {
    strategyCounts.set(a.recommendedStrategy, (strategyCounts.get(a.recommendedStrategy) ?? 0) + 1);
  }
  const strategyDistribution: StrategyDistribution[] = Array.from(strategyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([strategy, count]) => ({
      strategy,
      count,
      percentage: Math.round((count / total) * 100),
    }));

  // ── Score distribution bands ──────────────────────────────────────────────
  const bands = [
    { band: "0–24 (Low)", min: 0, max: 24 },
    { band: "25–49 (Below Average)", min: 25, max: 49 },
    { band: "50–69 (Moderate)", min: 50, max: 69 },
    { band: "70–84 (Good)", min: 70, max: 84 },
    { band: "85–100 (Excellent)", min: 85, max: 100 },
  ];
  const scoreDistribution = bands.map(({ band, min, max }) => ({
    band,
    count: assessments.filter((a) => a.overallScore >= min && a.overallScore <= max).length,
  }));

  // ── Top blockers across the portfolio ─────────────────────────────────────
  const blockerMap = new Map<string, number>();
  for (const a of assessments) {
    for (const v of a.guardrailViolations ?? []) {
      if (v.severity === "CRITICAL" || v.severity === "HIGH") {
        blockerMap.set(v.rule, (blockerMap.get(v.rule) ?? 0) + 1);
      }
    }
  }
  const topBlockers = Array.from(blockerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([rule, count]) => `${rule} (${count} workload${count > 1 ? "s" : ""})`);

  // ── Cost estimates ────────────────────────────────────────────────────────
  // These are very rough — production use should run estimate_migration_cost per workload
  const retireCount = strategyDistribution.find((s) => s.strategy === "Retire")?.count ?? 0;
  const migratingCount = total - retireCount - (strategyDistribution.find((s) => s.strategy === "Retain")?.count ?? 0);
  const estimatedTotalMigrationCostUsd = migratingCount * 45000; // ~$45k per workload ROM
  const estimatedTotalAnnualSavingsUsd = migratingCount * 28000; // ~$28k annual savings ROM

  // ── Wave and duration estimates ───────────────────────────────────────────
  // Simple heuristic: 6–8 workloads per wave, 8–12 weeks per wave, waves run sequentially
  const waveable = assessments.filter((a) => !["Retire", "Retain"].includes(a.recommendedStrategy));
  const waveCount = Math.max(1, Math.ceil(waveable.length / 7));
  const programmeDurationWeeks = waveCount * 10 + 8; // 8 weeks mobilisation

  // ── Health notes ──────────────────────────────────────────────────────────
  const healthNotes: string[] = [];

  const retirePct = Math.round((retireCount / total) * 100);
  if (retirePct >= 10) {
    healthNotes.push(`${retireCount} workload${retireCount > 1 ? "s" : ""} (${retirePct}%) are Retire candidates — decommissioning these first reduces programme scope and cost before migration waves begin.`);
  }

  const notReadyPct = Math.round((notReady / total) * 100);
  if (notReadyPct >= 20) {
    healthNotes.push(`${notReady} workloads (${notReadyPct}%) are Not Ready — a pre-migration remediation sprint is recommended before wave 1 to avoid blockers during migration.`);
  }

  const refactorCount = strategyDistribution.find((s) => s.strategy === "Refactor")?.count ?? 0;
  if (refactorCount > Math.ceil(total * 0.15)) {
    healthNotes.push(`${refactorCount} workloads assigned Refactor strategy — this is high-effort work. Consider whether some can be deferred post-migration or substituted with Repurchase.`);
  }

  const avgScore = Math.round(assessments.reduce((s, a) => s + a.overallScore, 0) / total);
  healthNotes.push(`Portfolio average migration score: ${avgScore}/100. ${avgScore >= 70 ? "Portfolio is broadly cloud-ready." : avgScore >= 50 ? "Portfolio has moderate readiness — targeted remediation will improve wave velocity." : "Portfolio readiness is low — a detailed discovery and remediation phase is strongly recommended."}`);

  if (topBlockers.length > 0) {
    healthNotes.push(`Top repeated blockers: ${topBlockers.slice(0, 3).join("; ")}. Resolving these at a programme level will unblock multiple workloads.`);
  }

  return {
    totalWorkloads: total,
    readySummary: { ready, needsWork, notReady },
    strategyDistribution,
    scoreDistribution,
    topBlockers,
    estimatedTotalAnnualSavingsUsd,
    estimatedTotalMigrationCostUsd,
    estimatedWaveCount: waveCount,
    estimatedProgrammeDurationWeeks: programmeDurationWeeks,
    portfolioHealthNotes: healthNotes,
  };
}
