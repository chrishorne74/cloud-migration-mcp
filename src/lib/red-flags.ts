import type { WorkloadInput } from "../types/index.js";

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
  const flags: RedFlag[] = [];

  // ── BLOCKER: Hard migration stoppers ─────────────────────────────────────

  if (workload.hasPhysicalHardwareDependency === true) {
    flags.push({
      id: "RF-BLOCKER-001",
      severity: "BLOCKER",
      category: "Technical",
      title: "Physical hardware dependency — cannot migrate to standard IaaS",
      detail: "The workload requires physical hardware (dongle, FPGA, specialised NIC, proprietary storage, PCI card) with no standard cloud equivalent.",
      recommendation: "Evaluate cloud-equivalent managed services (CloudHSM, Dedicated HSM, bare-metal cloud). If no equivalent exists, assign Retain strategy. Document as a hard blocker.",
      source: "Gartner; IBM Rapid Assessment; AWS MAP; Azure CAF; GCP Cloud Adoption Framework",
    });
  }

  if (workload.latencyRequirementMs !== undefined && workload.latencyRequirementMs < 1) {
    flags.push({
      id: "RF-BLOCKER-002",
      severity: "BLOCKER",
      category: "Technical",
      title: "Sub-millisecond latency SLA — incompatible with cloud network topology",
      detail: `Workload requires ${workload.latencyRequirementMs}ms latency. Cloud infrastructure cannot reliably achieve sub-millisecond latency over virtualised networks.`,
      recommendation: "Assign Retain strategy. Evaluate AWS Outposts, Azure Stack, or GCP Distributed Cloud for edge deployment. Document latency SLA in workload record.",
      source: "Google Cloud; IBM; DXC Technology",
    });
  }

  if (workload.cloudLicensingConfirmed === false || workload.hasLicensingRisk === true) {
    flags.push({
      id: "RF-BLOCKER-003",
      severity: "BLOCKER",
      category: "Licensing",
      title: "Cloud licensing rights not confirmed — potential licence violation",
      detail: "One or more software licences have not been confirmed as permitting cloud deployment, or are known to prohibit or require renegotiation for cloud use.",
      recommendation: "Do not include in migration wave until licensing team confirms cloud deployment rights for all software components. Document BYOL eligibility and renegotiation requirements per vendor.",
      source: "Azure CAF; AWS MAP; Gartner — 6 Ways Cloud Migration Costs Go Off the Rails",
    });
  }

  if (workload.dataClassification === "restricted" && !workload.complianceRequirements?.length) {
    flags.push({
      id: "RF-BLOCKER-004",
      severity: "BLOCKER",
      category: "Compliance",
      title: "Restricted data classification without compliance framework defined",
      detail: "Workload handles Restricted/classified data but no compliance framework has been specified. Security and legal controls cannot be validated without a defined framework.",
      recommendation: "Engage compliance and security teams to define the applicable framework before migration. Do not include in a wave until the compliance architecture is approved.",
      source: "Azure CAF MG-SEC-005; AWS Secure Migrations Framework",
    });
  }

  // SQL Server hard blockers
  if (workload.sqlServerFeatures?.includes("FILESTREAM") || workload.sqlServerFeatures?.includes("FileTable")) {
    flags.push({
      id: "RF-BLOCKER-005",
      severity: "BLOCKER",
      category: "Database",
      title: "SQL Server FILESTREAM/FileTable detected — blocks Azure SQL Managed Instance migration",
      detail: "FILESTREAM and FileTable cannot be backed up and restored to Azure SQL Managed Instance. This is a hard technical blocker with no workaround short of removing FILESTREAM from the application.",
      recommendation: "Migrate to SQL Server on Azure VM / EC2 instead of a managed instance, or remove FILESTREAM usage and replace with Blob/S3 storage before migration.",
      source: "Microsoft Azure SQL Assessment documentation; Azure Migrate SQL Assessment rules",
    });
  }

  if (workload.oracleFeatures?.includes("ANYDATA")) {
    flags.push({
      id: "RF-BLOCKER-006",
      severity: "BLOCKER",
      category: "Database",
      title: "Oracle ANYDATA type detected — unsupported by GCP DMS, tables cannot be replicated",
      detail: "The Oracle ANYDATA type is completely unsupported by Google Cloud Database Migration Service. Affected tables cannot be replicated at all.",
      recommendation: "Migrate ANYDATA tables via bulk export/import with planned downtime window. These tables cannot be included in continuous DMS replication.",
      source: "GCP DMS Oracle-to-AlloyDB known limitations; GCP DMS Oracle-to-PostgreSQL known limitations",
    });
  }

  if (workload.oracleFeatures?.includes("IndexOrganisedTables") || workload.oracleFeatures?.includes("IOT")) {
    flags.push({
      id: "RF-BLOCKER-007",
      severity: "BLOCKER",
      category: "Database",
      title: "Oracle Index-Organised Tables (IOTs) detected — not supported by GCP DMS",
      detail: "Index-Organised Tables cannot be replicated by GCP Database Migration Service. This is a hard blocker for DMS-based migration.",
      recommendation: "Plan bulk migration for IOTs outside the DMS replication stream. Validate data integrity independently post-migration.",
      source: "GCP DMS Oracle known limitations documentation",
    });
  }

  // ── HIGH: Significant barriers requiring pre-migration remediation ────────

  if (workload.hasHardcodedNetworkRefs === true) {
    flags.push({
      id: "RF-HIGH-001",
      severity: "HIGH",
      category: "Technical",
      title: "Hardcoded IP addresses or server names detected in application code/config",
      detail: "Applications with hardcoded private IP addresses, server hostnames, or Windows UNC paths will fail immediately after migration — cloud instances receive new IPs and DNS names. This is detected in 38% of migration failures.",
      recommendation: "Scan application code, config files, and registry using CAST Highlight, GitHub Copilot AppCAT, or equivalent. Remediate before the migration wave or document as a Day 1 post-cutover fix item with explicit rollback criteria.",
      source: "Azure CAF migration anti-patterns; Uptime Institute 2025 (38% of failed projects cite dependency conflicts); AWS Prescriptive Guidance",
    });
  }

  if (workload.hasTablesWithoutPrimaryKeys === true) {
    flags.push({
      id: "RF-HIGH-002",
      severity: "HIGH",
      category: "Database",
      title: "Tables without primary keys — DMS replication may produce silent data integrity failures",
      detail: "AWS DMS and GCP DMS cannot guarantee consistent CDC replication for tables lacking primary keys. Row identification depends on PKs or supplemental logging.",
      recommendation: "Identify all tables without primary keys during database assessment. Add primary keys or configure supplemental logging before initiating DMS. Validate row counts and checksums post-migration for all affected tables.",
      source: "GCP DMS documentation; AWS DMS best practices",
    });
  }

  if (workload.sqlServerFeatures && workload.sqlServerFeatures.some(f => ["xp_cmdshell", "CLR", "LinkedServers", "DistributedTransactions", "MultipleLogFiles"].includes(f))) {
    const features = workload.sqlServerFeatures.filter(f => ["xp_cmdshell", "CLR", "LinkedServers", "DistributedTransactions", "MultipleLogFiles"].includes(f));
    flags.push({
      id: "RF-HIGH-003",
      severity: "HIGH",
      category: "Database",
      title: `SQL Server features requiring target validation: ${features.join(", ")}`,
      detail: `These SQL Server features may not be supported or behave differently in managed cloud SQL services. Multiple log files block Azure SQL MI restore. xp_cmdshell and linked servers require explicit enablement or have no equivalent in managed services.`,
      recommendation: "Run Azure SQL Assessment or AWS Schema Conversion Tool before migration. Test each flagged feature in target environment during dry run. Consider SQL Server on IaaS VM as a lower-risk target if multiple blockers exist.",
      source: "Azure SQL Assessment rules; Microsoft T-SQL differences for SQL MI documentation",
    });
  }

  if (workload.hasLocalFilesystemDependency === true) {
    flags.push({
      id: "RF-HIGH-004",
      severity: "HIGH",
      category: "Technical",
      title: "Local filesystem persistent state dependency — incompatible with containerisation and auto-scaling",
      detail: "The application writes persistent state to local disk. Containers and auto-scaled cloud instances do not preserve local state between restarts, causing data loss on scale-out events.",
      recommendation: "Externalise state to managed storage (S3, Azure Blob, Cloud Storage, managed database) as part of Replatform or Refactor strategy. For Rehost, document local state as a post-migration risk with explicit SLA impact.",
      source: "GCP containerisation fit assessment rules; IBM Rapid Assessment; AWS Well-Architected",
    });
  }

  if (workload.hasComDcomDependency === true) {
    flags.push({
      id: "RF-HIGH-005",
      severity: "HIGH",
      category: "Technical",
      title: "COM/DCOM/ActiveX dependency — limits to Windows IaaS only, blocks containerisation",
      detail: "COM, DCOM, and ActiveX cannot be containerised or deployed to Linux-based managed runtimes. Migration is limited to Windows IaaS VMs at premium cost with limited scaling options.",
      recommendation: "Assign Rehost strategy targeting Windows IaaS. Include modernisation (removal of COM/DCOM) as a post-migration refactoring initiative. Estimate additional licensing cost for Windows-only IaaS.",
      source: "Azure CAF; IBM application modernisation assessment",
    });
  }

  if (workload.hasCustomKernelModules === true) {
    flags.push({
      id: "RF-HIGH-006",
      severity: "HIGH",
      category: "Technical",
      title: "Custom kernel modules — incompatible with standard cloud managed OS images",
      detail: "Custom kernel modules cannot be deployed on hyperscaler-managed OS images. Cloud IaaS requires standard kernel versions; custom modules require bare-metal or custom AMI/image builds at significant additional cost.",
      recommendation: "Evaluate whether custom kernel functionality can be replaced with user-space equivalents. If not, plan bare-metal cloud or custom image build. Consider Retain if cost of custom image maintenance is prohibitive.",
      source: "GCP Migrate to Containers fit assessment; AWS AMI customisation guidance",
    });
  }

  if (workload.isMainframe === true) {
    const hasAssembler = workload.mainframeLanguages?.includes("Assembler");
    const hasNatural = workload.mainframeLanguages?.includes("Natural");
    const hasIDMS = workload.attributes?.some(a => a.name === "database" && String(a.value).includes("IDMS"));

    flags.push({
      id: "RF-HIGH-007",
      severity: hasAssembler || hasNatural || hasIDMS ? "BLOCKER" : "HIGH",
      category: "Mainframe",
      title: `Mainframe workload detected${workload.mainframeLanguages?.length ? ` — languages: ${workload.mainframeLanguages.join(", ")}` : ""}`,
      detail: "Mainframe workloads cannot be migrated using standard cloud migration tools and require specialist assessment, extended timelines, and dedicated programme tracks. Full mainframe exit for material scope cannot be achieved in under 12 months.",
      recommendation: "Engage a mainframe modernisation specialist. Conduct a dedicated mainframe assessment covering: language inventory (COBOL, PL/I, Assembler, Natural, Easytrieve, RPG), batch dependency mapping (minimum 4-week observation), database inventory (Db2, IMS, IDMS, VSAM, Adabas), and knowledge capture plan. Do not merge into standard migration wave plan.",
      source: "IBM Garage; DXC Technology; TCS Mainframe Factory; BMC (Top 5 Reasons Mainframe Migrations Fail); mLogica",
    });

    if (hasAssembler) {
      flags.push({
        id: "RF-BLOCKER-008",
        severity: "BLOCKER",
        category: "Mainframe",
        title: "IBM Assembler code in production paths — no automated conversion tool handles this reliably",
        detail: "Assembler in production code paths cannot be automatically converted by any commercially available tool. Manual reverse engineering and rewrite is required. This is the most common cause of mainframe programme failure.",
        recommendation: "Inventory all Assembler modules and classify as: utility (replaceable with standard library), infrastructure (cloud equivalent exists), or business logic (manual rewrite required). Document Assembler scope explicitly in programme plan and timeline.",
        source: "IBM; BMC; mLogica; TCS mainframe assessment methodology",
      });
    }

    if (hasNatural) {
      flags.push({
        id: "RF-HIGH-008",
        severity: "HIGH",
        category: "Mainframe",
        title: "Natural/Adabas stack detected — specialist skills required, extended timeline",
        detail: "Natural (Software AG) application stacks running on Adabas have significantly fewer automated conversion tools than COBOL/Db2. Specialist skills are extremely scarce. Natural/Adabas programmes consistently exceed scope estimates.",
        recommendation: "Treat Natural/Adabas as a separate workstream with dedicated specialist assessment. Do not include in COBOL-based conversion timelines. Engage vendors with proven Natural/Adabas modernisation reference customers.",
        source: "IBM; BMC (Top 5 Reasons Mainframe Migrations Fail); DXC Technology",
      });
    }
  }

  if (workload.dependencyMappingComplete === false) {
    flags.push({
      id: "RF-HIGH-009",
      severity: "HIGH",
      category: "Organisational",
      title: "Dependency mapping not complete — wave planning cannot be finalised",
      detail: "38% of failed migration projects cite unanticipated dependency conflicts as a root cause. Manual-only dependency discovery produces low-confidence wave plans. Migrating before dependency mapping is complete causes post-cutover failures.",
      recommendation: "Complete automated dependency mapping before finalising wave composition. Use AWS Application Discovery Service, Azure Migrate dependency analysis, Google Migration Center, or third-party tools (Flexera, TDS TransitionManager). Treat complete dependency map as a mandatory wave sign-off criterion.",
      source: "Uptime Institute 2025; Gartner — 6 Ways Cloud Migration Costs Go Off the Rails; AWS MAP; Azure CAF",
    });
  }

  // ── MEDIUM: Elevated risk, manageable with pre-planning ──────────────────

  const cpu = workload.cpuUtilisation90DayAvgPct;
  if (cpu !== undefined) {
    if (cpu < 5) {
      flags.push({
        id: "RF-MEDIUM-001",
        severity: "MEDIUM",
        category: "Activity",
        title: `Zombie workload detected — ${cpu}% average CPU utilisation over 90 days`,
        detail: "CPU/memory utilisation below 5% for 90 days indicates a zombie application. AWS Prescriptive Guidance recommends evaluating these for retirement before migration. Migrating zombie workloads consumes migration effort with no business value.",
        recommendation: "Confirm with application owner whether this workload is still required. If no active users or business function exists, assign Retire strategy. If active usage is confirmed, document and proceed.",
        source: "AWS MAP; AWS Prescriptive Guidance — 7Rs selection criteria; Gartner",
      });
    } else if (cpu < 20 && workload.hasInboundConnections90Day === false) {
      flags.push({
        id: "RF-MEDIUM-002",
        severity: "MEDIUM",
        category: "Activity",
        title: `Idle workload with no inbound connections — ${cpu}% CPU, no connections in 90 days`,
        detail: "Low CPU utilisation combined with no inbound connections over 90 days is a strong indicator of an unused or dead application. AWS defines this as an idle/dead workload that is a Retire candidate.",
        recommendation: "Confirm with application owner. If no active users, assign Retire strategy. Estimated 10–20% of typical enterprise portfolios qualify for retirement (AWS, Gartner).",
        source: "AWS MAP; AWS Prescriptive Guidance retirement criteria",
      });
    }
  }

  if (workload.hasExecutiveSponsor === false) {
    flags.push({
      id: "RF-MEDIUM-003",
      severity: "MEDIUM",
      category: "Organisational",
      title: "No confirmed executive sponsor for this workload",
      detail: "Cloud migrations without executive sponsorship experience scope instability, application owner resistance, and unresolvable blockers. Gartner identifies this as the #1 organisational red flag.",
      recommendation: "Identify and confirm an executive sponsor before including this workload in a migration wave. Ensure the sponsor has authority to resolve blockers within 48 hours.",
      source: "Gartner — 10 Common Cloud Strategy Mistakes; AWS MAP MRA; Google Cloud Adoption Framework",
    });
  }

  if (workload.latencyRequirementMs !== undefined && workload.latencyRequirementMs < 10) {
    flags.push({
      id: "RF-MEDIUM-004",
      severity: "MEDIUM",
      category: "Technical",
      title: `Very tight latency requirement (${workload.latencyRequirementMs}ms) — dedicated interconnect required`,
      detail: "Sub-10ms latency requirements require dedicated cloud interconnect (AWS Direct Connect, Azure ExpressRoute, GCP Cloud Interconnect). Standard internet-based cloud connectivity will not meet this SLA.",
      recommendation: "Confirm dedicated cloud interconnect is provisioned and tested before this workload migrates. Validate actual latency in the target environment during dry run. Do not cut over until SLA is validated.",
      source: "Google Cloud; IBM; DXC Technology migration assessment criteria",
    });
  }

  // ── WARNINGS: Items requiring documentation or monitoring ─────────────────

  if (!workload.documentationLevel || workload.documentationLevel === "low") {
    flags.push({
      id: "RF-WARN-001",
      severity: "WARNING",
      category: "Governance",
      title: "Poor or missing documentation increases migration discovery effort and risk",
      detail: "Low documentation quality requires additional discovery effort and increases the risk of undiscovered dependencies, incorrect dependency mapping, and post-cutover failures.",
      recommendation: "Invest in documentation discovery (application owner interviews, automated scanning) before finalising the migration plan. Factor increased discovery effort into wave timing.",
      source: "IBM Rapid Assessment; AWS Prescriptive Guidance detailed assessment requirements",
    });
  }

  if (workload.complianceRequirements && workload.complianceRequirements.some(r => /pci/i.test(r))) {
    flags.push({
      id: "RF-WARN-002",
      severity: "WARNING",
      category: "Compliance",
      title: "PCI-DSS in-scope workload — QSA review required before migration",
      detail: "PCI-DSS workloads require the cloud target architecture to be reviewed by a Qualified Security Assessor (QSA) before migration. CDE workloads must be isolated in a dedicated network environment.",
      recommendation: "Engage QSA at architecture design stage, not post-migration. Separate CDE workloads into a dedicated migration wave with isolated network controls.",
      source: "Azure CAF MG-CMP-002; AWS Secure Migrations Framework; PCI DSS v4.0",
    });
  }

  if (!workload.vendorSupportActive && !workload.saasAlternativeExists) {
    flags.push({
      id: "RF-WARN-003",
      severity: "WARNING",
      category: "Technical",
      title: "Vendor support ended with no SaaS alternative — elevated maintenance risk post-migration",
      detail: "Migrating a workload whose vendor has ended support to the cloud does not resolve the support gap. The workload will be unpatched in the cloud environment unless upgraded.",
      recommendation: "Include OS/middleware upgrade as part of the Replatform strategy. Alternatively, evaluate if a supported replacement exists. Document the residual risk if migrated without upgrade.",
      source: "Azure CAF conditional readiness criteria; AWS Prescriptive Guidance",
    });
  }

  // ── Build report ──────────────────────────────────────────────────────────

  const blockers = flags.filter(f => f.severity === "BLOCKER");
  const highs = flags.filter(f => f.severity === "HIGH");
  const mediums = flags.filter(f => f.severity === "MEDIUM");
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
