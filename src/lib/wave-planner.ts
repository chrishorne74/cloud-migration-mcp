import type { MigrationAssessment, MigrationWave, WavePlan } from "../types/index.js";

export interface WaveInput {
  assessment: MigrationAssessment;
  /** Explicit group tag — workloads with same group go in the same wave */
  group?: string;
  /** Explicit dependencies — list of workload names this one depends on */
  dependsOn?: string[];
}

/**
 * Group workloads into migration waves using a dependency-aware, risk-ordered approach.
 *
 * Wave 0: Foundation (shared infra, security, networking — not assessed workloads)
 * Wave 1+: Ordered by score descending, respecting dependencies and guardrails
 */
export function planWaves(
  inputs: WaveInput[],
  maxWorkloadsPerWave = 5
): WavePlan {
  const notes: string[] = [];

  // Separate Retire/Retain
  const toRetire = inputs.filter((i) => i.assessment.recommendedStrategy === "Retire");
  const toRetain = inputs.filter((i) => i.assessment.recommendedStrategy === "Retain");
  const toMigrate = inputs.filter(
    (i) => !["Retire", "Retain"].includes(i.assessment.recommendedStrategy)
  );

  if (toRetire.length > 0) {
    notes.push(`${toRetire.length} workload(s) recommended for retirement — not included in wave plan: ${toRetire.map((i) => i.assessment.workloadName).join(", ")}`);
  }
  if (toRetain.length > 0) {
    notes.push(`${toRetain.length} workload(s) recommended to retain on-premises — not in wave plan: ${toRetain.map((i) => i.assessment.workloadName).join(", ")}`);
  }

  // Sort by score descending (best candidates first), then by risk ascending
  const sorted = [...toMigrate].sort((a, b) => {
    const scoreDiff = b.assessment.overallScore - a.assessment.overallScore;
    if (scoreDiff !== 0) return scoreDiff;
    const riskOrder = { Low: 0, Medium: 1, High: 2 };
    return riskOrder[a.assessment.estimatedRisk] - riskOrder[b.assessment.estimatedRisk];
  });

  // Resolve explicit groups
  const groupMap = new Map<string, WaveInput[]>();
  const ungrouped: WaveInput[] = [];

  for (const item of sorted) {
    if (item.group) {
      const grp = groupMap.get(item.group) ?? [];
      grp.push(item);
      groupMap.set(item.group, grp);
    } else {
      ungrouped.push(item);
    }
  }

  // Build ordered batches: groups first (preserving group cohesion), then ungrouped
  const batches: WaveInput[][] = [];
  for (const [, members] of groupMap) {
    batches.push(members);
  }
  // Add ungrouped as individual or small batches
  for (let i = 0; i < ungrouped.length; i += maxWorkloadsPerWave) {
    batches.push(ungrouped.slice(i, i + maxWorkloadsPerWave));
  }

  // Build waves
  const waves: MigrationWave[] = [];

  for (let idx = 0; idx < batches.length; idx++) {
    const batch = batches[idx];
    const waveNumber = idx + 1;
    const workloadNames = batch.map((b) => b.assessment.workloadName);

    // Find wave dependencies (waves containing workloads that this wave depends on)
    const depWaves = new Set<number>();
    for (const item of batch) {
      if (item.dependsOn) {
        for (const dep of item.dependsOn) {
          const depWaveIdx = waves.findIndex((w) => w.workloads.includes(dep));
          if (depWaveIdx >= 0) depWaves.add(waves[depWaveIdx].waveNumber);
        }
      }
    }

    // Effort estimate
    const effortWeeks = estimateWaveEffort(batch);

    const strategies = [...new Set(batch.map((b) => b.assessment.recommendedStrategy))];
    const risks = batch.map((b) => b.assessment.estimatedRisk);
    const maxRisk = risks.includes("High") ? "High" : risks.includes("Medium") ? "Medium" : "Low";

    const rationale =
      `Strategy mix: ${strategies.join(", ")}. ` +
      `Migration risk: ${maxRisk}. ` +
      `${batch[0].group ? `Grouped by affinity: ${batch[0].group}.` : "Ordered by migration candidate score."}`;

    waves.push({
      waveNumber,
      name: `Wave ${waveNumber}`,
      workloads: workloadNames,
      rationale,
      estimatedDurationWeeks: effortWeeks,
      dependencies: Array.from(depWaves),
    });
  }

  const totalWeeks = waves.reduce((s, w) => s + w.estimatedDurationWeeks, 0);
  // With parallelism, actual calendar time could be shorter
  notes.push("Wave durations are sequential estimates. Parallel execution of independent waves can compress the overall programme timeline.");
  notes.push("Always include Wave 0 (Landing Zone foundation) before Wave 1 begins. Landing Zone is not included in this plan.");

  return {
    waves,
    totalWorkloads: toMigrate.length,
    estimatedTotalWeeks: totalWeeks,
    notes,
  };
}

function estimateWaveEffort(batch: WaveInput[]): number {
  const effortMap: Record<string, number> = {
    Low: 4,
    Medium: 8,
    High: 16,
  };
  const maxEffort = batch.reduce(
    (max, item) => Math.max(max, effortMap[item.assessment.estimatedEffort] ?? 8),
    0
  );
  // Add buffer for wave management
  return maxEffort + 2;
}
