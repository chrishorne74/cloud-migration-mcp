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
