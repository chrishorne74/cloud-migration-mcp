import type { MigrationStrategy, WorkloadInput } from "../types/index.js";

// ─── Runbook output ───────────────────────────────────────────────────────────

export interface MigrationRunbook {
  workloadName: string;
  strategy: MigrationStrategy;
  targetCloud?: string;
  generatedDate: string;
  sections: RunbookSection[];
}

export interface RunbookSection {
  title: string;
  items: RunbookItem[];
}

export interface RunbookItem {
  id: string;
  task: string;
  owner: string;           // suggested role
  timing: string;          // e.g. "T-30 days", "Cutover window", "Day 1"
  notes?: string;
}

// ─── Common sections across all strategies ────────────────────────────────────

function preFlightSection(w: WorkloadInput): RunbookSection {
  return {
    title: "Pre-Flight Checks (T-7 days)",
    items: [
      { id: "PF-01", task: "Confirm migration date and maintenance window with business stakeholders", owner: "Migration Lead", timing: "T-7 days" },
      { id: "PF-02", task: "Verify target cloud environment is provisioned and accessible (VPC/VNet, subnets, security groups)", owner: "Cloud Engineer", timing: "T-7 days" },
      { id: "PF-03", task: "Confirm backups of source system are healthy and restorable", owner: "Operations", timing: "T-7 days" },
      { id: "PF-04", task: "Validate all dependency services are accessible from target environment", owner: "Cloud Engineer", timing: "T-5 days" },
      { id: "PF-05", task: "Communicate planned outage window to all stakeholders and end users", owner: "Migration Lead", timing: "T-3 days" },
      { id: "PF-06", task: "Confirm rollback criteria and rollback procedure with team", owner: "Migration Lead", timing: "T-2 days" },
      { id: "PF-07", task: "Freeze non-critical application changes (change freeze)", owner: "Change Manager", timing: "T-2 days" },
      { id: "PF-08", task: "Run final smoke test on non-production migrated environment", owner: "Test Engineer", timing: "T-1 day" },
      { id: "PF-09", task: "Confirm on-call contacts and escalation path for cutover night", owner: "Migration Lead", timing: "T-1 day" },
      {
        id: "PF-10",
        task: `Take final backup / snapshot of source system${w.database ? ` including ${w.database} database` : ""}`,
        owner: "Operations",
        timing: "T-0 (cutover start)",
      },
    ],
  };
}

function hypercareSurvivalSection(): RunbookSection {
  return {
    title: "Post-Cutover Hypercare (Days 1–14)",
    items: [
      { id: "HC-01", task: "Monitor application error rates and latency in cloud monitoring dashboard", owner: "Operations", timing: "Day 1 — continuous" },
      { id: "HC-02", task: "Confirm all scheduled jobs/batch processes executed successfully", owner: "Operations", timing: "Day 1" },
      { id: "HC-03", task: "Validate end-user access via all authentication paths (SSO, MFA, VPN)", owner: "Operations", timing: "Day 1" },
      { id: "HC-04", task: "Confirm backup jobs running and producing valid backups in cloud target", owner: "Operations", timing: "Day 2" },
      { id: "HC-05", task: "Conduct post-migration review with application owners and key users", owner: "Migration Lead", timing: "Day 3" },
      { id: "HC-06", task: "Resolve any outstanding Day 1 issues from issue log", owner: "Cloud Engineer", timing: "Days 1–5" },
      { id: "HC-07", task: "Lift change freeze and return to normal change cadence", owner: "Change Manager", timing: "Day 5 (if stable)" },
      { id: "HC-08", task: "Decommission source system (after minimum 2-week hypercare period)", owner: "Operations", timing: "Day 14+" },
      { id: "HC-09", task: "Update CMDB, asset register, and runbook with new cloud endpoints", owner: "Operations", timing: "Day 7" },
      { id: "HC-10", task: "Confirm cost tagging is in place and cost allocation is visible in cloud billing", owner: "FinOps", timing: "Day 7" },
    ],
  };
}

function rollbackSection(w: WorkloadInput, strategy: MigrationStrategy): RunbookSection {
  const triggers = [
    "Application error rate exceeds baseline by >5% for more than 10 minutes post-cutover",
    "Critical business function unavailable and no workaround exists",
    "Data integrity issue detected (row count mismatch, corruption)",
    "Performance degradation >50% vs. baseline for more than 30 minutes",
  ];

  if (strategy === "Rehost" || strategy === "Relocate") {
    triggers.push("DNS TTL has expired and traffic cannot be redirected back within SLA");
  }

  return {
    title: "Rollback Procedure",
    items: [
      { id: "RB-01", task: `Rollback decision gate: confirm rollback against criteria: ${triggers.slice(0, 2).join("; ")}`, owner: "Migration Lead", timing: "Cutover window", notes: "Rollback must be decided within agreed window — default 4 hours post-cutover start" },
      { id: "RB-02", task: "Revert DNS / load balancer entries to point back to source system", owner: "Cloud Engineer", timing: "Immediate on rollback decision" },
      { id: "RB-03", task: `Restore source system from pre-migration backup if data was modified${w.database ? " — restore database from snapshot" : ""}`, owner: "Operations", timing: "As required" },
      { id: "RB-04", task: "Notify stakeholders of rollback and provide estimated resolution timeline", owner: "Migration Lead", timing: "Within 30 mins of rollback" },
      { id: "RB-05", task: "Document root cause and corrective actions before re-attempting migration", owner: "Migration Lead", timing: "Post-rollback" },
    ],
  };
}

// ─── Strategy-specific cutover sections ──────────────────────────────────────

function rehostCutover(w: WorkloadInput): RunbookSection {
  return {
    title: "Cutover Steps — Rehost (Lift & Shift)",
    items: [
      { id: "RH-01", task: "Initiate final replication sync (AWS MGN / Azure Migrate / Migrate for Compute) and confirm delta is <15 minutes", owner: "Cloud Engineer", timing: "T-0" },
      { id: "RH-02", task: "Stop application tier to prevent writes to source system", owner: "Operations", timing: "T-0 + 15 min" },
      { id: "RH-03", task: "Allow final replication cycle to complete (confirm 0 delta)", owner: "Cloud Engineer", timing: "T-0 + 30 min" },
      { id: "RH-04", task: "Perform test launch of migrated instance in cloud — do not cut over DNS yet", owner: "Cloud Engineer", timing: "T-0 + 35 min" },
      { id: "RH-05", task: "Run smoke tests against test-launched cloud instance (API health, DB connectivity, key user journeys)", owner: "Test Engineer", timing: "T-0 + 40 min" },
      { id: "RH-06", task: "Update DNS / load balancer to point to cloud instance (reduce TTL to 60s in advance)", owner: "Cloud Engineer", timing: "T-0 + 50 min" },
      { id: "RH-07", task: "Confirm application accessible via production URL from external network", owner: "Test Engineer", timing: "T-0 + 55 min" },
      { id: "RH-08", task: "Monitor error rates and latency for 30 minutes post-DNS cutover", owner: "Operations", timing: "T-0 + 55 min to +90 min" },
      { id: "RH-09", task: "Formally close cutover window — declare migration successful or initiate rollback", owner: "Migration Lead", timing: "T-0 + 90 min" },
    ],
  };
}

function replatformCutover(w: WorkloadInput): RunbookSection {
  return {
    title: "Cutover Steps — Replatform",
    items: [
      { id: "RP-01", task: "Confirm managed database migration is complete and replication lag is <5 seconds", owner: "Cloud Engineer", timing: "T-0" },
      { id: "RP-02", task: "Stop application tier and drain active connections", owner: "Operations", timing: "T-0 + 5 min" },
      { id: "RP-03", task: "Run final DMS/database replication cycle and confirm data consistency (row count check)", owner: "Cloud Engineer", timing: "T-0 + 10 min" },
      { id: "RP-04", task: "Update application connection strings to new managed database endpoint", owner: "Cloud Engineer", timing: "T-0 + 15 min" },
      { id: "RP-05", task: "Deploy application to cloud managed runtime (ECS/AKS/App Service/managed container)", owner: "Cloud Engineer", timing: "T-0 + 20 min" },
      { id: "RP-06", task: "Run smoke tests: health endpoints, DB connectivity, key user journeys", owner: "Test Engineer", timing: "T-0 + 30 min" },
      { id: "RP-07", task: "Update DNS / load balancer to new cloud endpoint", owner: "Cloud Engineer", timing: "T-0 + 40 min" },
      { id: "RP-08", task: "Monitor error rates, latency, and database performance for 60 minutes post-cutover", owner: "Operations", timing: "T-0 + 40 min to +100 min" },
    ],
  };
}

function refactorCutover(_w: WorkloadInput): RunbookSection {
  return {
    title: "Cutover Steps — Refactor / Re-architect",
    items: [
      { id: "RF-01", task: "Confirm new cloud-native application has passed all integration, performance, and security tests", owner: "Test Engineer", timing: "T-7 days" },
      { id: "RF-02", task: "Execute data migration from legacy data store to new cloud-native data store", owner: "Cloud Engineer", timing: "T-0" },
      { id: "RF-03", task: "Validate data completeness and integrity in new data store", owner: "Test Engineer", timing: "T-0 + 30 min" },
      { id: "RF-04", task: "Enable feature flags for new cloud-native endpoints (canary or blue/green deployment)", owner: "Cloud Engineer", timing: "T-0 + 45 min" },
      { id: "RF-05", task: "Shift a small percentage of traffic (5–10%) to new environment via load balancer weighted routing", owner: "Cloud Engineer", timing: "T-0 + 50 min" },
      { id: "RF-06", task: "Monitor error rates for 30 minutes on canary traffic before full cutover", owner: "Operations", timing: "T-0 + 50 min to +80 min" },
      { id: "RF-07", task: "Gradually increase traffic to new environment (25% → 50% → 100% over 2–4 hours)", owner: "Cloud Engineer", timing: "T-0 + 80 min to +4 hours" },
      { id: "RF-08", task: "Decommission legacy environment after 100% traffic cut and 24-hour observation", owner: "Operations", timing: "T+1 day" },
    ],
  };
}

function repurchaseCutover(_w: WorkloadInput): RunbookSection {
  return {
    title: "Cutover Steps — Repurchase (SaaS)",
    items: [
      { id: "PU-01", task: "Confirm SaaS environment is provisioned, licensed, and user accounts created", owner: "Cloud Engineer", timing: "T-14 days" },
      { id: "PU-02", task: "Complete data migration from legacy system to SaaS platform", owner: "Cloud Engineer", timing: "T-7 days" },
      { id: "PU-03", task: "Run user acceptance testing (UAT) with key business users on SaaS platform", owner: "Test Engineer", timing: "T-5 days" },
      { id: "PU-04", task: "Confirm SSO / SAML integration with corporate identity provider", owner: "Identity Team", timing: "T-3 days" },
      { id: "PU-05", task: "Communicate go-live date and user training resources to all end users", owner: "Migration Lead", timing: "T-2 days" },
      { id: "PU-06", task: "Disable access to legacy system on cutover date", owner: "Operations", timing: "T-0" },
      { id: "PU-07", task: "Redirect all users to new SaaS URL / application", owner: "Operations", timing: "T-0" },
      { id: "PU-08", task: "Provide Day 1 user support channel (Slack, email, helpdesk ticket category)", owner: "Migration Lead", timing: "Day 1" },
    ],
  };
}

function retireCutover(w: WorkloadInput): RunbookSection {
  return {
    title: "Decommission Steps — Retire",
    items: [
      { id: "RT-01", task: "Confirm written approval from application owner and business stakeholder to decommission", owner: "Migration Lead", timing: "T-30 days" },
      { id: "RT-02", task: `Archive ${w.database ? "database and " : ""}application data per data retention policy`, owner: "Operations", timing: "T-14 days" },
      { id: "RT-03", task: "Remove application from all load balancers and DNS zones", owner: "Cloud Engineer", timing: "T-0" },
      { id: "RT-04", task: "Revoke all service accounts, API keys, and certificates associated with this application", owner: "Security", timing: "T-0" },
      { id: "RT-05", task: "Decommission servers and release IP allocations", owner: "Operations", timing: "T-0 + 1 day" },
      { id: "RT-06", task: "Remove from monitoring, alerting, and backup systems", owner: "Operations", timing: "T-0 + 2 days" },
      { id: "RT-07", task: "Update CMDB to reflect decommissioned status with decommission date", owner: "Operations", timing: "T-0 + 3 days" },
      { id: "RT-08", task: "Verify no downstream systems are attempting to connect to decommissioned endpoints", owner: "Operations", timing: "T+7 days" },
    ],
  };
}

function relocateCutover(_w: WorkloadInput): RunbookSection {
  return {
    title: "Cutover Steps — Relocate (VMware Hypervisor Lift)",
    items: [
      { id: "RL-01", task: "Confirm VMware Cloud on AWS / Azure VMware Solution / GCVE environment is provisioned and HCX is configured", owner: "Cloud Engineer", timing: "T-7 days" },
      { id: "RL-02", task: "Complete HCX vMotion or bulk migration of non-critical VMs and validate in cloud environment", owner: "Cloud Engineer", timing: "T-3 days" },
      { id: "RL-03", task: "Initiate HCX vMotion for production VMs during maintenance window", owner: "Cloud Engineer", timing: "T-0" },
      { id: "RL-04", task: "Monitor vMotion progress — confirm 0 dropped connections for running VMs", owner: "Cloud Engineer", timing: "T-0 (live)" },
      { id: "RL-05", task: "Update NSX-T firewall rules and network policies to match on-premises NSX configuration", owner: "Network Engineer", timing: "T-0 + 30 min" },
      { id: "RL-06", task: "Validate application functionality from end-user perspective", owner: "Test Engineer", timing: "T-0 + 45 min" },
      { id: "RL-07", task: "Decommission source SDDC VMs after 2-week parallel run confirmation", owner: "Operations", timing: "T+14 days" },
    ],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateRunbook(workload: WorkloadInput, strategy: MigrationStrategy, targetCloud?: string): MigrationRunbook {
  const sections: RunbookSection[] = [];

  sections.push(preFlightSection(workload));

  switch (strategy) {
    case "Rehost":
      sections.push(rehostCutover(workload));
      break;
    case "Replatform":
      sections.push(replatformCutover(workload));
      break;
    case "Refactor":
      sections.push(refactorCutover(workload));
      break;
    case "Repurchase":
      sections.push(repurchaseCutover(workload));
      break;
    case "Retire":
      sections.push(retireCutover(workload));
      break;
    case "Relocate":
      sections.push(relocateCutover(workload));
      break;
    case "Retain":
      sections.push({
        title: "Retain — No Migration Action",
        items: [
          { id: "RN-01", task: "Document Retain decision and rationale in migration tracker", owner: "Migration Lead", timing: "Immediate" },
          { id: "RN-02", task: "Set review date (recommended: 6 months) to reassess workload for migration", owner: "Migration Lead", timing: "Immediate" },
          { id: "RN-03", task: "Identify and document blockers preventing migration for future resolution", owner: "Migration Lead", timing: "Immediate" },
        ],
      });
      break;
  }

  if (strategy !== "Retain" && strategy !== "Retire") {
    sections.push(rollbackSection(workload, strategy));
    sections.push(hypercareSurvivalSection());
  }

  return {
    workloadName: workload.name,
    strategy,
    targetCloud,
    generatedDate: new Date().toISOString().split("T")[0],
    sections,
  };
}
