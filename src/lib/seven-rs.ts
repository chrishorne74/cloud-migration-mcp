import type { MigrationStrategy, StrategyDefinition, WorkloadInput } from "../types/index.js";

// ─── Strategy definitions ─────────────────────────────────────────────────────

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    name: "Rehost",
    alias: "Lift & Shift",
    description:
      "Move the application to the cloud with minimal or no changes. Uses IaaS compute (VMs) in the target cloud. Fastest path to cloud, preserves existing architecture.",
    effort: "Low",
    cloudBenefit: "Low",
    risk: "Low",
    typicalIndicators: [
      "Application works well as-is with no required code changes",
      "Limited cloud-native feature requirements",
      "Short migration window or urgent deadline",
      "Binary-only or no access to source code",
      "High dependency count making refactoring impractical in the wave",
      "Operating system supported on cloud IaaS",
      "Organisation new to cloud — building operational experience first",
    ],
    typicalExclusions: [
      "Application requires cloud-native managed services to function",
      "OS or runtime is not supported on cloud IaaS",
      "Architecture has critical SPOFs that must be resolved",
    ],
  },
  {
    name: "Replatform",
    alias: "Lift, Tinker & Shift",
    description:
      "Move to the cloud with minor optimisations — such as moving to a managed database, container platform, or managed runtime — without changing the core application architecture or business logic.",
    effort: "Medium",
    cloudBenefit: "Medium",
    risk: "Low",
    typicalIndicators: [
      "Database can be moved to a managed service (RDS, Azure SQL, Cloud SQL)",
      "Application can be containerised with minimal effort",
      "Middleware can be replaced with a managed equivalent (SQS, Service Bus)",
      "OS upgrade is feasible within the migration window",
      "Source code is available and team has capacity for limited changes",
      "Database version is end-of-life — upgrade needed anyway",
    ],
    typicalExclusions: [
      "Requires significant application code changes",
      "Binary-only — no source code access",
      "Very high compliance requirements that make managed services complex",
    ],
  },
  {
    name: "Repurchase",
    alias: "Drop & Shop",
    description:
      "Replace the existing application with a SaaS product that delivers equivalent functionality. Common for CRM, HR, collaboration, and ERP applications.",
    effort: "Medium",
    cloudBenefit: "High",
    risk: "Medium",
    typicalIndicators: [
      "A mature SaaS alternative exists (e.g. Salesforce, Workday, ServiceNow, Microsoft 365)",
      "Application is a commodity function, not a differentiator",
      "Current application is heavily customised legacy software with high maintenance cost",
      "Vendor support is ending",
      "Low data sensitivity — data can move to SaaS provider",
    ],
    typicalExclusions: [
      "No viable SaaS alternative exists",
      "Application is a core competitive differentiator",
      "Data residency or sensitivity prevents use of third-party SaaS",
      "Customisation requirements exceed SaaS platform capabilities",
    ],
  },
  {
    name: "Refactor",
    alias: "Re-architect",
    description:
      "Re-imagine how the application is architected and developed using cloud-native features. May involve breaking a monolith into microservices, adopting serverless, or rebuilding key components. Highest cloud benefit but highest effort.",
    effort: "High",
    cloudBenefit: "High",
    risk: "High",
    typicalIndicators: [
      "Application has significant scalability or reliability limitations that cannot be solved by rehosting",
      "Business requires cloud-native capabilities (event-driven, serverless, auto-scaling)",
      "Monolith that would benefit from decomposition",
      "Source code is available and development team has cloud-native skills",
      "Long-term application with high strategic value",
      "Current architecture creates ongoing operational burden",
    ],
    typicalExclusions: [
      "Short migration timeline — refactoring takes months to years",
      "Source code not available",
      "Team lacks cloud-native development skills",
      "Application nearing end-of-life",
    ],
  },
  {
    name: "Retire",
    alias: "Decommission",
    description:
      "Decommission applications that are no longer required. Reduces portfolio complexity and eliminates ongoing cost. Often 10–20% of applications in a large migration can be retired.",
    effort: "Low",
    cloudBenefit: "High",
    risk: "Low",
    typicalIndicators: [
      "Application has very low or zero active users",
      "Business function is delivered by another system",
      "Application is a duplicate or shadow IT system",
      "Application was scheduled for decommission but still running",
      "Very high age with minimal business value",
      "High annual cost relative to usage",
    ],
    typicalExclusions: [
      "Application still has active users or business function",
      "Data retention obligations require the system to remain accessible",
      "Regulatory or legal hold prevents decommission",
    ],
  },
  {
    name: "Retain",
    alias: "Revisit",
    description:
      "Keep the application on-premises or in its current environment for now. Appropriate for applications that are too risky, too complex, or simply not worth migrating at this time.",
    effort: "Low",
    cloudBenefit: "Low",
    risk: "Low",
    typicalIndicators: [
      "Recent significant investment in the current environment",
      "Application has a dependency that cannot yet be migrated (e.g. hardware-bound)",
      "Regulatory or compliance blocker not yet resolved",
      "Application scheduled for replacement within 12 months",
      "Migration complexity is disproportionate to business benefit",
      "Mission-critical with no tolerance for migration risk in current window",
    ],
    typicalExclusions: [
      "Clear cloud-ready path exists",
      "Current environment is being decommissioned",
      "Vendor support ending and on-premises becomes untenable",
    ],
  },
  {
    name: "Relocate",
    alias: "Hypervisor Lift",
    description:
      "Move virtualised infrastructure to the cloud using the same hypervisor platform (e.g. VMware Cloud on AWS, Azure VMware Solution, Google Cloud VMware Engine). Preserves existing VMware tools and processes.",
    effort: "Low",
    cloudBenefit: "Medium",
    risk: "Low",
    typicalIndicators: [
      "Organisation uses VMware vSphere extensively",
      "Applications are certified on VMware and recertification is not feasible",
      "Migration speed is critical — no time for OS-level changes",
      "Organisation wants to maintain existing VMware operational tooling",
      "Disaster recovery use case — replicate VMware VMs to cloud",
    ],
    typicalExclusions: [
      "Organisation not using VMware",
      "Applications require cloud-native managed services",
      "Cost optimisation is the primary driver — VMware cloud solutions carry a premium",
    ],
  },
];

// ─── Strategy recommendation engine ──────────────────────────────────────────

interface StrategyScore {
  strategy: MigrationStrategy;
  score: number;
  reasons: string[];
}

export function recommendStrategy(
  workload: WorkloadInput,
  overallCandidateScore: number
): { primary: MigrationStrategy; alternatives: MigrationStrategy[]; rationale: string[] } {
  const scores: StrategyScore[] = STRATEGY_DEFINITIONS.map((def) => ({
    strategy: def.name,
    score: scoreStrategy(def, workload, overallCandidateScore),
    reasons: [],
  }));

  scores.sort((a, b) => b.score - a.score);

  const rationale = buildRationale(workload, scores[0].strategy);

  return {
    primary: scores[0].strategy,
    alternatives: scores.slice(1, 3).map((s) => s.strategy),
    rationale,
  };
}

function scoreStrategy(
  def: StrategyDefinition,
  w: WorkloadInput,
  candidateScore: number
): number {
  let score = 0;

  switch (def.name) {
    case "Retire":
      // Strong signal if low criticality, high age, low users, duplicate
      if ((w.businessCriticality ?? 3) <= 1) score += 50;
      if ((w.ageYears ?? 0) > 15) score += 20;
      if ((w.userCount ?? 999) < 10) score += 20;
      if ((w.annualCostUsd ?? 0) > 100000 && (w.businessCriticality ?? 3) <= 2) score += 20;
      break;

    case "Retain":
      // Signal: high criticality, high complexity, recent investment
      if ((w.businessCriticality ?? 3) >= 5) score += 30;
      if ((w.dependencyCount ?? 0) > 20) score += 20;
      if (candidateScore < 30) score += 30;
      break;

    case "Repurchase":
      if (w.saasAlternativeExists) score += 60;
      if ((w.businessCriticality ?? 3) <= 3) score += 15;
      if (!w.sourceCodeAvailable) score += 15;
      break;

    case "Relocate":
      // VMware-specific
      if (w.attributes?.some((a) => a.name === "hypervisor" && /vmware|vsphere/i.test(String(a.value)))) {
        score += 60;
      }
      if ((w.dependencyCount ?? 0) > 10) score += 15;
      break;

    case "Rehost":
      if (!w.sourceCodeAvailable) score += 30;
      if ((w.dependencyCount ?? 0) > 10) score += 20;
      if ((w.businessCriticality ?? 3) >= 4 && candidateScore > 50) score += 20;
      if (!w.saasAlternativeExists) score += 10;
      score += 15; // baseline — always viable
      break;

    case "Replatform": {
      const hasDb = !!w.database;
      const hasModernTech = w.technology && !/cobol|mainframe|powerbuilder|foxpro/i.test(w.technology);
      if (hasDb) score += 25;
      if (w.sourceCodeAvailable) score += 20;
      if (hasModernTech) score += 20;
      if ((w.ageYears ?? 0) > 5 && (w.ageYears ?? 0) <= 15) score += 15;
      if (!w.vendorSupportActive && !w.saasAlternativeExists) score += 15;
      break;
    }

    case "Refactor": {
      const isModernTech = w.technology && /java|\.net|node|python|go|kotlin|typescript/i.test(w.technology);
      if (w.sourceCodeAvailable && isModernTech) score += 40;
      if ((w.businessCriticality ?? 3) >= 4) score += 15;
      if ((w.dependencyCount ?? 0) <= 5) score += 15;
      if ((w.ageYears ?? 0) < 10) score += 10;
      break;
    }
  }

  return score;
}

function buildRationale(w: WorkloadInput, strategy: MigrationStrategy): string[] {
  const reasons: string[] = [];

  switch (strategy) {
    case "Rehost":
      reasons.push("Fastest path to cloud with minimal change risk.");
      if (!w.sourceCodeAvailable) reasons.push("Source code not available — limiting modification options.");
      if ((w.dependencyCount ?? 0) > 10) reasons.push("High dependency count makes re-architecture impractical in this wave.");
      break;
    case "Replatform":
      reasons.push("Minor optimisations (managed DB, container runtime) achievable within migration effort.");
      if (w.database) reasons.push(`Database (${w.database}) is a strong candidate for a managed cloud database service.`);
      break;
    case "Repurchase":
      reasons.push("A SaaS alternative exists that covers the required business function.");
      if (!w.sourceCodeAvailable) reasons.push("No source code access reduces confidence in other migration approaches.");
      break;
    case "Refactor":
      reasons.push("Cloud-native re-architecture will resolve scalability/reliability limitations and maximise long-term cloud value.");
      break;
    case "Retire":
      reasons.push("Application shows low utilisation and/or business value — decommission is the most cost-effective path.");
      break;
    case "Retain":
      reasons.push("Migration risk or complexity is disproportionate to business benefit at this time — defer to a future wave.");
      if ((w.businessCriticality ?? 3) >= 5) reasons.push("Mission-critical application — risk tolerance is insufficient for current wave.");
      break;
    case "Relocate":
      reasons.push("VMware-based infrastructure can be relocated using cloud VMware solutions with minimal operational change.");
      break;
  }

  return reasons;
}

export function getStrategyDefinition(name: MigrationStrategy): StrategyDefinition | undefined {
  return STRATEGY_DEFINITIONS.find((d) => d.name === name);
}
