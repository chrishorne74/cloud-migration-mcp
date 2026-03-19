import type { MigrationStrategy, WorkloadInput } from "../types/index.js";

export interface CostEstimate {
  workloadName: string;
  currentAnnualCostUsd: number;
  estimatedCloudAnnualCostUsd: number;
  migrationOneTimeCostUsd: number;
  estimatedSavingsYear1Usd: number;
  estimatedSavingsYear3Usd: number;
  roiBreakEvenMonths: number;
  cloudCostBreakdown: CostLineItem[];
  migrationCostBreakdown: CostLineItem[];
  assumptions: string[];
  caveats: string[];
}

export interface CostLineItem {
  item: string;
  annualCostUsd?: number;
  oneTimeCostUsd?: number;
  notes: string;
}

/**
 * Produce a rough-order-of-magnitude (ROM) cost estimate.
 * Figures are illustrative — actual costs require cloud pricing calculator input.
 */
export function estimateCost(
  workload: WorkloadInput,
  strategy: MigrationStrategy,
  targetCloud: "aws" | "azure" | "gcp" = "aws"
): CostEstimate {
  const currentCost = workload.annualCostUsd ?? 0;

  // Cloud cost reduction factor by strategy
  const cloudCostFactors: Record<MigrationStrategy, number> = {
    Rehost: 0.75,      // ~25% saving from IaaS vs on-prem
    Replatform: 0.60,  // ~40% saving using managed services
    Repurchase: 0.65,  // SaaS often cheaper than maintaining own
    Refactor: 0.45,    // Cloud-native delivers highest efficiency
    Retire: 0.05,      // Near-zero ongoing cost
    Retain: 1.0,       // No change
    Relocate: 0.80,    // VMware cloud carries a premium
  };

  const factor = cloudCostFactors[strategy];
  const estimatedCloudAnnualCost = Math.round(currentCost * factor);

  // Migration one-time cost estimate
  const migrationCostMultipliers: Record<MigrationStrategy, number> = {
    Rehost: 0.10,
    Replatform: 0.20,
    Repurchase: 0.30,
    Refactor: 0.60,
    Retire: 0.05,
    Retain: 0.02,
    Relocate: 0.12,
  };

  const migrationOneTime = Math.round(
    Math.max(currentCost * migrationCostMultipliers[strategy], 5000)
  );

  // Year 1 savings = current - (cloud cost + migration one-time)
  const year1Saving = currentCost - estimatedCloudAnnualCost - migrationOneTime;
  // Year 3 savings (migration one-time is sunk)
  const year3Saving = (currentCost - estimatedCloudAnnualCost) * 3 - migrationOneTime;

  // Break-even in months
  const monthlySaving = (currentCost - estimatedCloudAnnualCost) / 12;
  const breakEven = monthlySaving > 0 ? Math.ceil(migrationOneTime / monthlySaving) : 999;

  // Cost breakdown
  const cloudBreakdown = buildCloudBreakdown(
    workload,
    strategy,
    estimatedCloudAnnualCost,
    targetCloud
  );

  const migrationBreakdown = buildMigrationBreakdown(workload, strategy, migrationOneTime);

  const assumptions = buildAssumptions(workload, strategy, targetCloud);
  const caveats = buildCaveats(strategy);

  return {
    workloadName: workload.name,
    currentAnnualCostUsd: currentCost,
    estimatedCloudAnnualCostUsd: estimatedCloudAnnualCost,
    migrationOneTimeCostUsd: migrationOneTime,
    estimatedSavingsYear1Usd: year1Saving,
    estimatedSavingsYear3Usd: year3Saving,
    roiBreakEvenMonths: breakEven,
    cloudCostBreakdown: cloudBreakdown,
    migrationCostBreakdown: migrationBreakdown,
    assumptions,
    caveats,
  };
}

function buildCloudBreakdown(
  w: WorkloadInput,
  strategy: MigrationStrategy,
  total: number,
  cloud: string
): CostLineItem[] {
  if (strategy === "Retire") {
    return [{ item: "Decommissioned — no ongoing cloud cost", annualCostUsd: 0, notes: "Application will be retired" }];
  }
  if (strategy === "Retain") {
    return [{ item: "No change — retained on-premises", annualCostUsd: w.annualCostUsd ?? 0, notes: "On-premises costs unchanged" }];
  }

  const compute = Math.round(total * 0.40);
  const storage = Math.round(total * 0.15);
  const network = Math.round(total * 0.10);
  const managed = Math.round(total * 0.20);
  const support = Math.round(total * 0.08);
  const other = total - compute - storage - network - managed - support;

  const provider = cloud === "aws" ? "AWS" : cloud === "azure" ? "Azure" : "GCP";

  return [
    { item: `${provider} Compute (EC2/VMs/GCE)`, annualCostUsd: compute, notes: "Right-sized from utilisation data" },
    { item: `${provider} Storage`, annualCostUsd: storage, notes: "Block + object storage" },
    { item: `${provider} Network / Data Transfer`, annualCostUsd: network, notes: "Egress and inter-AZ transfer estimate" },
    { item: `${provider} Managed Services`, annualCostUsd: managed, notes: strategy === "Replatform" || strategy === "Refactor" ? "RDS / Managed DB / Message Queue etc." : "Monitoring, backup, load balancer" },
    { item: `${provider} Support Plan`, annualCostUsd: support, notes: "Business or Enterprise support" },
    { item: "Other / Licensing", annualCostUsd: other, notes: "BYOL or cloud-native licence costs" },
  ];
}

function buildMigrationBreakdown(
  w: WorkloadInput,
  strategy: MigrationStrategy,
  total: number
): CostLineItem[] {
  const effortDays = Math.round(total / 1500); // Assume ~$1,500/day blended rate

  const breakdown: CostLineItem[] = [
    { item: "Discovery & Assessment", oneTimeCostUsd: Math.round(total * 0.10), notes: "Dependency mapping, performance baselining" },
    { item: "Migration Design", oneTimeCostUsd: Math.round(total * 0.12), notes: "Target architecture, runbook design" },
    { item: "Migration Execution", oneTimeCostUsd: Math.round(total * 0.40), notes: `~${effortDays} engineer-days estimated` },
    { item: "Testing & Validation", oneTimeCostUsd: Math.round(total * 0.18), notes: "UAT, performance, security, data validation" },
    { item: "Cutover & Hypercare", oneTimeCostUsd: Math.round(total * 0.12), notes: "2-week hypercare period included" },
    { item: "Training & Knowledge Transfer", oneTimeCostUsd: Math.round(total * 0.08), notes: "Cloud operations upskilling" },
  ];

  if (strategy === "Repurchase") {
    breakdown.push({ item: "Data Migration & SaaS Onboarding", oneTimeCostUsd: Math.round(total * 0.15), notes: "ETL, data transformation, SaaS configuration" });
  }

  if (strategy === "Refactor") {
    breakdown.push({ item: "Application Re-development", oneTimeCostUsd: Math.round(total * 0.30), notes: "Additional development effort for cloud-native re-architecture" });
  }

  void w; // workload available for future customisation
  return breakdown;
}

function buildAssumptions(
  w: WorkloadInput,
  strategy: MigrationStrategy,
  cloud: string
): string[] {
  return [
    `Estimates based on ${strategy} migration strategy to ${cloud.toUpperCase()}.`,
    `Current annual cost baseline: ${w.annualCostUsd ? `$${w.annualCostUsd.toLocaleString()}` : "not provided — estimates will be approximate"}.`,
    "Cloud compute costs assume on-demand pricing; Reserved Instances or Savings Plans could reduce costs by 30–60%.",
    "Migration effort assumes a skilled team — costs will vary with team experience and tooling.",
    "Network costs assume moderate data transfer — high-egress workloads should be modelled separately.",
    "Decommission savings from source environment are not included — ensure they are added to the business case.",
  ];
}

function buildCaveats(strategy: MigrationStrategy): string[] {
  const common = [
    "These are rough-order-of-magnitude (ROM) estimates ±50%. Engage cloud pricing team for detailed quotes.",
    "Actual savings depend on right-sizing, reserved capacity adoption, and source environment decommission.",
  ];

  if (strategy === "Refactor") {
    common.push("Refactor projects often experience scope creep — include a 20% contingency in the budget.");
  }
  if (strategy === "Repurchase") {
    common.push("SaaS subscription pricing can escalate with user count — validate per-user pricing tiers.");
  }
  if (strategy === "Relocate") {
    common.push("VMware cloud solutions (AWS VMware, AVS) carry a premium over native cloud — evaluate native migration after initial lift.");
  }

  return common;
}
