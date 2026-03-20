// ─── 7 Rs Migration Strategies ───────────────────────────────────────────────

export const SEVEN_RS = [
  "Rehost",
  "Replatform",
  "Repurchase",
  "Refactor",
  "Retire",
  "Retain",
  "Relocate",
] as const;

export type MigrationStrategy = (typeof SEVEN_RS)[number];

export interface StrategyDefinition {
  name: MigrationStrategy;
  alias: string;
  description: string;
  effort: "Low" | "Medium" | "High";
  cloudBenefit: "Low" | "Medium" | "High";
  risk: "Low" | "Medium" | "High";
  typicalIndicators: string[];
  typicalExclusions: string[];
}

// ─── Workload ─────────────────────────────────────────────────────────────────

export interface WorkloadAttribute {
  name: string;
  value: string | number | boolean;
}

export interface WorkloadInput {
  name: string;
  description?: string;
  /** e.g. "Java Spring Boot", ".NET Framework 4.6", "COBOL mainframe" */
  technology?: string;
  /** e.g. "on-premises", "hosted", "colocation" */
  currentEnvironment?: string;
  /** e.g. "Windows Server 2012", "RHEL 7", "Solaris" */
  operatingSystem?: string;
  /** e.g. "SQL Server 2012", "Oracle 11g", "MySQL 5.7" */
  database?: string;
  /** Business criticality 1 (low) – 5 (mission critical) */
  businessCriticality?: number;
  /** Number of upstream/downstream dependencies */
  dependencyCount?: number;
  /** Number of users / requests per day */
  userCount?: number;
  /** Annual run cost in USD */
  annualCostUsd?: number;
  /** Data classification: public, internal, confidential, restricted */
  dataClassification?: string;
  /** Compliance requirements e.g. PCI-DSS, HIPAA, GDPR */
  complianceRequirements?: string[];
  /** Does the app have a vendor-supported container image or SaaS alternative? */
  saasAlternativeExists?: boolean;
  /** Is the vendor still providing support? */
  vendorSupportActive?: boolean;
  /** Application age in years */
  ageYears?: number;
  /** How well-documented is the application? low | medium | high */
  documentationLevel?: "low" | "medium" | "high";
  /** Is the source code available? */
  sourceCodeAvailable?: boolean;
  /** Custom attributes */
  attributes?: WorkloadAttribute[];

  // ── Activity metrics (zombie/idle detection — AWS MAP guidance) ──────────
  /** Average CPU utilisation over last 90 days (%) */
  cpuUtilisation90DayAvgPct?: number;
  /** Average memory utilisation over last 90 days (%) */
  memoryUtilisation90DayAvgPct?: number;
  /** Has the application received inbound network connections in the last 90 days? */
  hasInboundConnections90Day?: boolean;

  // ── Architecture anti-patterns ───────────────────────────────────────────
  /** Number of detected code/architecture anti-patterns (hardcoded IPs, local FS deps, COM/DCOM, UNC paths, etc.) */
  architectureAntiPatternCount?: number;
  /** Does the application have hardcoded IP addresses or server names in code/config? */
  hasHardcodedNetworkRefs?: boolean;
  /** Does the application write persistent state to local filesystem? */
  hasLocalFilesystemDependency?: boolean;
  /** Does the application use COM, DCOM, or ActiveX? */
  hasComDcomDependency?: boolean;
  /** Does the application depend on specific physical hardware (dongles, FPGAs, NICs, proprietary storage)? */
  hasPhysicalHardwareDependency?: boolean;
  /** Does the application require custom kernel modules? */
  hasCustomKernelModules?: boolean;

  // ── Latency requirements ─────────────────────────────────────────────────
  /** Latency SLA requirement in milliseconds (e.g. 1 = sub-ms, 10, 50, 200) */
  latencyRequirementMs?: number;

  // ── Platform flags ───────────────────────────────────────────────────────
  /** Is this a mainframe workload (IBM z/OS, AS/400/IBMi, Unisys, etc.)? */
  isMainframe?: boolean;
  /** Mainframe languages present (e.g. ['COBOL', 'PL/I', 'Assembler', 'Natural', 'Easytrieve']) */
  mainframeLanguages?: string[];
  /** Non-x86 platform identifier (e.g. 'zOS', 'IBMi', 'Solaris SPARC', 'HP-UX', 'AIX') */
  platform?: string;

  // ── Database flags ───────────────────────────────────────────────────────
  /** SQL Server-specific features in use that affect managed service eligibility */
  sqlServerFeatures?: Array<"FILESTREAM" | "FileTable" | "xp_cmdshell" | "CLR" | "LinkedServers" | "DistributedTransactions" | "MultipleLogFiles">;
  /** Oracle-specific features in use */
  oracleFeatures?: Array<"ANYDATA" | "IndexOrganisedTables" | "StoredProcs" | "Triggers" | "IOT" | "XmlDb">;
  /** Does any table in scope lack a primary key? */
  hasTablesWithoutPrimaryKeys?: boolean;

  // ── Licensing ────────────────────────────────────────────────────────────
  /** Has the licence team confirmed cloud deployment rights for all software? */
  cloudLicensingConfirmed?: boolean;
  /** Are there known licences that may prohibit or require renegotiation for cloud? */
  hasLicensingRisk?: boolean;

  // ── Organisational ───────────────────────────────────────────────────────
  /** Is there a confirmed executive sponsor for this workload's migration? */
  hasExecutiveSponsor?: boolean;
  /** Has formal dependency mapping been completed for this workload? */
  dependencyMappingComplete?: boolean;

  // ── Container fitness (12-factor / containerisation readiness) ───────────
  /** Does the application process requests statelessly (no in-memory session state)? */
  isStateless?: boolean;
  /** Is all configuration injected via environment variables (not baked into code/config files)? */
  configViaEnvVars?: boolean;
  /** Does the application expose a health check HTTP endpoint? */
  hasHealthCheckEndpoint?: boolean;
  /** Does the application write logs to stdout/stderr (structured logging)? */
  hasStructuredLogging?: boolean;
  /** Does the application run as a non-root user? */
  runsAsNonRootUser?: boolean;
  /** Is a Dockerfile or container image build definition already present? */
  hasDockerfile?: boolean;
  /** Is the application already containerised (Docker, Podman, etc.)? */
  isAlreadyContainerised?: boolean;
  /** Existing container platform if already containerised (e.g. 'Docker Compose', 'OpenShift', 'Rancher') */
  existingContainerPlatform?: string;
  /** Does the application require privileged mode or host networking inside a container? */
  requiresPrivilegedMode?: boolean;
  /** Does the application have Windows-only dependencies (COM, .NET Framework < 4.8, Windows Registry, specific Windows DLLs)? */
  hasWindowsOnlyDependencies?: boolean;

  // ── Database migration ────────────────────────────────────────────────────
  /** Database engine version string, e.g. 'SQL Server 2014', 'Oracle 12c', 'MySQL 5.7' */
  databaseVersion?: string;
  /** Approximate database size in GB */
  databaseSizeGb?: number;
  /** Maximum acceptable downtime during database migration */
  databaseDowntimeTolerance?: "zero" | "minutes" | "hours" | "days";
  /** Is continuous replication (CDC) required during migration? */
  requiresContinuousReplication?: boolean;
  /** Desired target database engine, e.g. 'Aurora PostgreSQL', 'RDS SQL Server', 'Cloud SQL' */
  targetDatabaseEngine?: string;
  /** Approximate number of stored procedures and triggers */
  storedProcedureCount?: number;

  // ── Network readiness ─────────────────────────────────────────────────────
  /** Primary connectivity method to cloud */
  connectivityMethod?: "internet" | "vpn" | "direct-connect" | "expressroute" | "cloud-interconnect" | "none";
  /** Is a DNS migration strategy defined (split-horizon, resolver rules, etc.)? */
  hasDnsStrategy?: boolean;
  /** Approximate number of firewall rules that need to be translated to cloud security groups/NSGs */
  firewallRuleCount?: number;
  /** Has a cloud landing zone (VPC/VNet, IAM baseline, logging) been deployed? */
  hasLandingZoneDeployed?: boolean;
  /** Target cloud region, e.g. 'eu-west-1', 'australiaeast' */
  targetCloudRegion?: string;
  /** Has network connectivity been tested end-to-end to the target environment? */
  networkConnectivityTested?: boolean;

  // ── VMware estate ─────────────────────────────────────────────────────────
  /** Hypervisor type, e.g. 'VMware vSphere', 'Hyper-V', 'KVM', 'Nutanix' */
  hypervisorType?: string;
  /** vSphere version, e.g. '6.7', '7.0', '8.0' */
  vSphereVersion?: string;
  /** Is VMware vSAN in use for storage? */
  usesVsan?: boolean;
  /** Is VMware NSX-T (network virtualisation) in use? */
  usesNsxt?: boolean;
  /** Number of VMs in scope */
  vmCount?: number;
  /** Are any applications VMware-certified (requiring recertification on new platform)? */
  usesVmwareCertifiedApps?: boolean;

  // ── Carbon / sustainability ───────────────────────────────────────────────
  /** Number of physical servers currently running this workload */
  serverCount?: number;
  /** Average power consumption per server in watts */
  averageServerWatts?: number;
  /** Datacentre Power Usage Effectiveness (PUE) ratio — industry average ~1.58 */
  datacentrePuE?: number;
}

// ─── Assessment ───────────────────────────────────────────────────────────────

export interface CriterionScore {
  criterionId: string;
  criterionName: string;
  score: number;         // 0–100
  weight: number;        // relative weight
  weightedScore: number;
  rationale: string;
}

export interface MigrationAssessment {
  workloadName: string;
  overallScore: number;          // 0–100 (higher = better candidate)
  migrationReadiness: "Ready" | "Needs Work" | "Not Ready";
  recommendedStrategy: MigrationStrategy;
  alternativeStrategies: MigrationStrategy[];
  criterionScores: CriterionScore[];
  guardrailViolations: GuardrailViolation[];
  estimatedEffort: "Low" | "Medium" | "High";
  estimatedRisk: "Low" | "Medium" | "High";
  keyFindings: string[];
  recommendations: string[];
}

// ─── Guardrails ───────────────────────────────────────────────────────────────

export type GuardrailSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type GuardrailCategory =
  | "Dependency"
  | "Security"
  | "Compliance"
  | "Data"
  | "Architecture"
  | "Operations"
  | "Cost"
  | "Custom";

export interface Guardrail {
  id: string;
  category: GuardrailCategory;
  severity: GuardrailSeverity;
  rule: string;
  description: string;
  rationale: string;
  recommendation: string;
  /** Optional JS-evaluable check expression – used for automated checks */
  checkExpression?: string;
}

export interface GuardrailViolation {
  guardrailId: string;
  rule: string;
  severity: GuardrailSeverity;
  category: GuardrailCategory;
  detail: string;
  recommendation: string;
}

export interface GuardrailDocument {
  categories: { name: string; guardrails: Guardrail[] }[];
  totalRules: number;
  filePath: string;
  lastParsed: Date;
}

// ─── Scoring Criteria ─────────────────────────────────────────────────────────

export type CriterionDirection = "higher-is-better" | "lower-is-better";

export interface ScoringCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;           // 1–10
  direction: CriterionDirection;
  /** Attribute name on WorkloadInput to use for auto-scoring */
  workloadAttribute?: keyof WorkloadInput;
  /** Optional scoring bands for numeric attributes */
  bands?: { max: number; score: number; label: string }[];
  /** Free-text scoring notes */
  notes?: string;
}

export interface ScoringCriteriaDocument {
  criteria: ScoringCriterion[];
  totalWeight: number;
  filePath: string;
  lastParsed: Date;
}

// ─── Migration Wave ───────────────────────────────────────────────────────────

export interface MigrationWave {
  waveNumber: number;
  name: string;
  workloads: string[];           // workload names
  rationale: string;
  estimatedDurationWeeks: number;
  dependencies: number[];        // wave numbers this wave depends on
}

export interface WavePlan {
  waves: MigrationWave[];
  totalWorkloads: number;
  estimatedTotalWeeks: number;
  notes: string[];
}

// ─── Draw.io Diagram ──────────────────────────────────────────────────────────

export type DiagramNodeType =
  | "workload"
  | "database"
  | "network"
  | "storage"
  | "compute"
  | "security"
  | "integration"
  | "container"
  | "group";

export interface DiagramNode {
  id: string;
  label: string;
  type: DiagramNodeType;
  strategy?: MigrationStrategy;
  cloud?: "aws" | "azure" | "gcp";
  service?: string;   // e.g. "ec2", "rds", "aks"
  group?: string;     // group/container node id
}

export interface DiagramEdge {
  source: string;
  target: string;
  label?: string;
  style?: "solid" | "dashed" | "dotted";
}

export interface MigrationDiagramSpec {
  title: string;
  sourceEnvironment?: string;
  targetCloud?: "aws" | "azure" | "gcp";
  sourceNodes: DiagramNode[];
  targetNodes: DiagramNode[];
  edges: DiagramEdge[];
}

// ─── Container Fitness ────────────────────────────────────────────────────────

export type ContainerFitnessLevel = "Excellent" | "Good" | "Moderate" | "Poor" | "Not Suitable";
export type ContainerTargetPlatform =
  | "EKS / AKS / GKE (Kubernetes)"
  | "ECS / Azure Container Apps / Cloud Run"
  | "Windows Containers (ECS/AKS)"
  | "Existing container estate — Replatform to managed Kubernetes"
  | "Not Suitable — Rehost to IaaS instead";

export interface TwelveFactorCheck {
  factor: string;
  status: "Pass" | "Fail" | "Unknown";
  detail: string;
  weight: number;
}

export interface ContainerFitnessReport {
  workloadName: string;
  fitnessScore: number;          // 0–100
  fitnessLevel: ContainerFitnessLevel;
  recommendedPlatform: ContainerTargetPlatform;
  platformRationale: string;
  twelveFactorChecks: TwelveFactorCheck[];
  blockers: string[];
  remediationItems: string[];
  estimatedContainerisationEffort: "Low" | "Medium" | "High" | "Not Recommended";
}

// ─── Database Migration ───────────────────────────────────────────────────────

export type DatabaseMigrationPath = "Homogeneous" | "Heterogeneous" | "Near-Homogeneous";
export type DatabaseDowntimeModel = "Full Cutover" | "CDC Replication — Near-Zero Downtime" | "Snapshot + Bulk Load" | "Online Migration with Cutover Window";

export interface DatabaseMigrationRisk {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  mitigation: string;
}

export interface DatabaseMigrationAssessment {
  databaseName: string;
  sourceEngine: string;
  migrationPath: DatabaseMigrationPath;
  recommendedTarget: string;
  migrationTools: string[];
  schemaConversionRequired: boolean;
  estimatedConversionEffort: "Low" | "Medium" | "High" | "Very High";
  downtimeModel: DatabaseDowntimeModel;
  estimatedMigrationWeeks: number;
  risks: DatabaseMigrationRisk[];
  preChecklist: string[];
  postChecklist: string[];
}

// ─── Network Readiness ────────────────────────────────────────────────────────

export interface NetworkReadinessGap {
  area: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  action: string;
}

export interface NetworkReadinessReport {
  workloadName: string;
  overallReadiness: "Ready" | "Needs Work" | "Not Ready";
  readinessScore: number;   // 0–100
  gaps: NetworkReadinessGap[];
  recommendations: string[];
}

// ─── Portfolio Report ─────────────────────────────────────────────────────────

export interface StrategyDistribution {
  strategy: MigrationStrategy;
  count: number;
  percentage: number;
}

export interface PortfolioReport {
  totalWorkloads: number;
  readySummary: { ready: number; needsWork: number; notReady: number };
  strategyDistribution: StrategyDistribution[];
  scoreDistribution: { band: string; count: number }[];
  topBlockers: string[];
  estimatedTotalAnnualSavingsUsd: number;
  estimatedTotalMigrationCostUsd: number;
  estimatedWaveCount: number;
  estimatedProgrammeDurationWeeks: number;
  portfolioHealthNotes: string[];
}

// ─── Carbon Impact ────────────────────────────────────────────────────────────

export interface CarbonImpactReport {
  workloadName: string;
  onPremAnnualKwh: number;
  onPremAnnualCo2Kg: number;
  cloudAnnualKwh: number;
  cloudAnnualCo2Kg: number;
  co2ReductionKg: number;
  co2ReductionPct: number;
  equivalentCarKmRemoved: number;
  notes: string[];
}

// ─── VMware Assessment ────────────────────────────────────────────────────────

export type VMwareRecommendation =
  | "Relocate — VMware Cloud on AWS (VMC on AWS)"
  | "Relocate — Azure VMware Solution (AVS)"
  | "Relocate — Google Cloud VMware Engine (GCVE)"
  | "Rehost — Native IaaS (lift-and-shift to VMs)"
  | "Replatform — Migrate off VMware to cloud-native"
  | "Retain — VMware estate too complex or cost-prohibitive to migrate now";

export interface VMwareRisk {
  area: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  recommendation: string;
}

export interface VMwareAssessmentReport {
  workloadName: string;
  recommendation: VMwareRecommendation;
  rationale: string[];
  risks: VMwareRisk[];
  estimatedComplexity: "Low" | "Medium" | "High";
  recertificationRequired: boolean;
  toolingNotes: string[];
  estimatedWeeeksToRelocate: number;
}
