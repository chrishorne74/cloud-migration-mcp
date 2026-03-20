import type {
  ContainerFitnessReport,
  ContainerFitnessLevel,
  ContainerTargetPlatform,
  TwelveFactorCheck,
  WorkloadInput,
} from "../types/index.js";

// ─── 12-Factor check definitions ─────────────────────────────────────────────

// Map from CON-xxx criterion ID to default weight for each check
const CHECK_CRITERION_MAP: Record<string, string> = {
  "III. Config — stored in environment":       "CON-002",
  "VI. Processes — stateless and share-nothing": "CON-001",
  "IV. Backing services — treat as attached resources": "CON-003",
  "IX. Disposability — fast startup, graceful shutdown": "CON-004",
  "XI. Logs — treat as event streams":         "CON-005",
  "Security — non-root container process":     "CON-006",
  "Build — Dockerfile / image definition present": "CON-007",
};

function w(factor: string, defaultWeight: number, weightsMap: Record<string, number>): number {
  const criterionId = CHECK_CRITERION_MAP[factor];
  return criterionId !== undefined && weightsMap[criterionId] !== undefined
    ? weightsMap[criterionId]
    : defaultWeight;
}

function buildTwelveFactorChecks(workload: WorkloadInput, weightsMap: Record<string, number> = {}): TwelveFactorCheck[] {
  return [
    {
      factor: "III. Config — stored in environment",
      status: workload.configViaEnvVars === true ? "Pass" : workload.configViaEnvVars === false ? "Fail" : "Unknown",
      detail:
        workload.configViaEnvVars === true
          ? "Configuration is injected via environment variables — 12-factor compliant."
          : workload.configViaEnvVars === false
          ? "Configuration is baked into code or config files — must be externalised before containerisation."
          : "Not assessed. Verify no credentials, URLs, or environment-specific settings are hardcoded.",
      weight: w("III. Config — stored in environment", 15, weightsMap),
    },
    {
      factor: "VI. Processes — stateless and share-nothing",
      status: workload.isStateless === true ? "Pass" : workload.isStateless === false ? "Fail" : "Unknown",
      detail:
        workload.isStateless === true
          ? "Application is stateless — compatible with horizontal scaling and container restarts."
          : workload.isStateless === false
          ? "Application maintains in-process state (sessions, file handles, local cache) — state must be externalised to Redis/managed DB/blob storage before containerisation."
          : "Not assessed. Check for in-memory session state, sticky sessions, or local file caching.",
      weight: w("VI. Processes — stateless and share-nothing", 20, weightsMap),
    },
    {
      factor: "IV. Backing services — treat as attached resources",
      status:
        workload.hasLocalFilesystemDependency === false ? "Pass"
        : workload.hasLocalFilesystemDependency === true ? "Fail"
        : "Unknown",
      detail:
        workload.hasLocalFilesystemDependency === true
          ? "Application writes persistent state to local filesystem — incompatible with containers. Externalise to managed storage (S3, Azure Blob, EFS, etc.)."
          : workload.hasLocalFilesystemDependency === false
          ? "No local filesystem persistent state detected — compliant."
          : "Not assessed. Check for writes to local disk outside of temporary/scratch usage.",
      weight: w("IV. Backing services — treat as attached resources", 15, weightsMap),
    },
    {
      factor: "IX. Disposability — fast startup, graceful shutdown",
      status: workload.hasHealthCheckEndpoint === true ? "Pass" : workload.hasHealthCheckEndpoint === false ? "Fail" : "Unknown",
      detail:
        workload.hasHealthCheckEndpoint === true
          ? "Application exposes a health check endpoint — compatible with container liveness/readiness probes."
          : workload.hasHealthCheckEndpoint === false
          ? "No health check endpoint — container orchestrators cannot determine readiness. Implement /health or /readyz endpoint."
          : "Not assessed. Liveness and readiness probes are mandatory for production Kubernetes deployments.",
      weight: w("IX. Disposability — fast startup, graceful shutdown", 10, weightsMap),
    },
    {
      factor: "XI. Logs — treat as event streams",
      status: workload.hasStructuredLogging === true ? "Pass" : workload.hasStructuredLogging === false ? "Fail" : "Unknown",
      detail:
        workload.hasStructuredLogging === true
          ? "Application writes structured logs to stdout/stderr — compatible with container log aggregation (CloudWatch, Azure Monitor, GCP Logging)."
          : workload.hasStructuredLogging === false
          ? "Application writes logs to local files — log agents cannot collect without a volume mount or sidecar. Implement stdout/stderr structured logging."
          : "Not assessed. Check whether application writes to local log files vs. stdout.",
      weight: w("XI. Logs — treat as event streams", 10, weightsMap),
    },
    {
      factor: "Security — non-root container process",
      status: workload.runsAsNonRootUser === true ? "Pass" : workload.runsAsNonRootUser === false ? "Fail" : "Unknown",
      detail:
        workload.runsAsNonRootUser === true
          ? "Application runs as a non-root user — meets CIS Docker Benchmark and Kubernetes Pod Security Standards."
          : workload.runsAsNonRootUser === false
          ? "Application requires root — violates CIS Docker Benchmark. Evaluate whether root is actually required or inherited from base image defaults."
          : "Not assessed. Verify the process UID in Dockerfile USER instruction or equivalent.",
      weight: w("Security — non-root container process", 10, weightsMap),
    },
    {
      factor: "Build — Dockerfile / image definition present",
      status: workload.hasDockerfile === true ? "Pass" : workload.hasDockerfile === false ? "Fail" : "Unknown",
      detail:
        workload.hasDockerfile === true
          ? "Dockerfile or container build definition exists — containerisation effort is lower."
          : workload.hasDockerfile === false
          ? "No Dockerfile present — containerisation effort includes writing and validating image build definition. Estimate 1–5 days depending on complexity."
          : "Not assessed.",
      weight: w("Build — Dockerfile / image definition present", 10, weightsMap),
    },
    {
      factor: "Platform — no Windows-only dependencies",
      status:
        workload.hasWindowsOnlyDependencies === false ? "Pass"
        : workload.hasWindowsOnlyDependencies === true ? "Fail"
        : workload.hasComDcomDependency === true ? "Fail"
        : "Unknown",
      detail:
        workload.hasWindowsOnlyDependencies === true || workload.hasComDcomDependency === true
          ? "Windows-only dependencies (COM/DCOM, .NET Framework, Windows Registry) detected — limited to Windows containers. Linux containers are not possible. Windows containers carry licensing overhead and have significantly larger image sizes (4–8 GB base)."
          : workload.hasWindowsOnlyDependencies === false
          ? "No Windows-only dependencies — Linux containers are viable, enabling smaller images and lower infrastructure cost."
          : "Not assessed. Check .NET Framework version, COM/DCOM usage, and Windows Registry dependencies.",
      weight: 10,
    },
  ];
}

// ─── Fitness scoring ──────────────────────────────────────────────────────────

function calculateFitnessScore(checks: TwelveFactorCheck[]): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of checks) {
    totalWeight += check.weight;
    if (check.status === "Pass") earnedWeight += check.weight;
    else if (check.status === "Unknown") earnedWeight += check.weight * 0.5; // partial credit for unknowns
  }

  return totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100);
}

function fitnessLevel(score: number, blockerCount: number): ContainerFitnessLevel {
  if (blockerCount > 0) return "Not Suitable";
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Moderate";
  if (score >= 25) return "Poor";
  return "Not Suitable";
}

// ─── Platform recommendation ──────────────────────────────────────────────────

function recommendPlatform(w: WorkloadInput, level: ContainerFitnessLevel): {
  platform: ContainerTargetPlatform;
  rationale: string;
} {
  // Hard blockers — cannot containerise
  if (
    w.hasPhysicalHardwareDependency === true ||
    w.hasCustomKernelModules === true ||
    w.requiresPrivilegedMode === true ||
    level === "Not Suitable"
  ) {
    return {
      platform: "Not Suitable — Rehost to IaaS instead",
      rationale:
        "One or more hard blockers prevent containerisation (physical hardware dependency, custom kernel modules, or privileged mode required). Assign Rehost strategy targeting standard IaaS VMs.",
    };
  }

  // Already containerised — lift to managed K8s
  if (w.isAlreadyContainerised === true) {
    return {
      platform: "Existing container estate — Replatform to managed Kubernetes",
      rationale: `Application is already containerised${w.existingContainerPlatform ? ` on ${w.existingContainerPlatform}` : ""}. Replatform to managed Kubernetes (EKS/AKS/GKE) to gain managed control plane, auto-scaling, and cloud-native integrations.`,
    };
  }

  // Windows-only
  if (w.hasWindowsOnlyDependencies === true || w.hasComDcomDependency === true) {
    return {
      platform: "Windows Containers (ECS/AKS)",
      rationale:
        "Windows-only dependencies (COM/DCOM, .NET Framework, Windows Registry) limit containerisation to Windows containers. Deploy to ECS on Windows or AKS with Windows node pools. Plan modernisation to .NET (Core/5+) to unlock Linux containers in a subsequent phase.",
    };
  }

  // Simple stateless app without complex orchestration needs — serverless containers
  const isSimpleStateless =
    w.isStateless === true &&
    (w.dependencyCount ?? 0) <= 5 &&
    (w.businessCriticality ?? 3) <= 3;

  if (isSimpleStateless) {
    return {
      platform: "ECS / Azure Container Apps / Cloud Run",
      rationale:
        "Stateless application with low dependency count and moderate criticality is well-suited to serverless container platforms (ECS Fargate, Azure Container Apps, Cloud Run). These eliminate cluster management overhead and suit event-driven or HTTP workloads with variable traffic patterns.",
    };
  }

  // Default — full managed Kubernetes
  return {
    platform: "EKS / AKS / GKE (Kubernetes)",
    rationale:
      "Application complexity, criticality, or dependency count justifies a full managed Kubernetes platform (EKS, AKS, or GKE). Kubernetes provides fine-grained resource control, service mesh integration, GitOps-friendly deployment, and advanced scaling options needed for this workload.",
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function assessContainerFitness(
  workload: WorkloadInput,
  weightsMap: Record<string, number> = {}
): ContainerFitnessReport {
  const checks = buildTwelveFactorChecks(workload, weightsMap);

  const blockers: string[] = [];
  const remediationItems: string[] = [];

  if (workload.hasPhysicalHardwareDependency === true) {
    blockers.push("Physical hardware dependency — cannot run in a container on standard IaaS.");
  }
  if (workload.hasCustomKernelModules === true) {
    blockers.push("Custom kernel modules — incompatible with standard container runtime environments.");
  }
  if (workload.requiresPrivilegedMode === true) {
    blockers.push("Privileged mode required — violates container security baseline; significantly increases attack surface.");
  }
  if (workload.isStateless === false) {
    remediationItems.push("Externalise in-process state to managed service (Redis/ElastiCache, Azure Cache, Memorystore) before containerising.");
  }
  if (workload.hasLocalFilesystemDependency === true) {
    remediationItems.push("Replace local filesystem writes with managed storage (S3, Azure Blob, GCS, EFS/Azure Files for shared mounts).");
  }
  if (workload.configViaEnvVars === false) {
    remediationItems.push("Externalise all configuration to environment variables or a secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager).");
  }
  if (workload.hasHealthCheckEndpoint === false) {
    remediationItems.push("Implement /health (liveness) and /ready (readiness) HTTP endpoints — mandatory for Kubernetes and ECS health checks.");
  }
  if (workload.hasStructuredLogging === false) {
    remediationItems.push("Migrate application logging to stdout/stderr with structured JSON format. Remove local log file writes.");
  }
  if (workload.runsAsNonRootUser === false) {
    remediationItems.push("Add USER instruction to Dockerfile to run as a non-root UID. Required by CIS Docker Benchmark and Kubernetes Pod Security Standards.");
  }
  if (!workload.hasDockerfile) {
    remediationItems.push("Create a Dockerfile using a distroless or minimal base image (e.g. gcr.io/distroless, alpine). Enable multi-stage builds to minimise final image size.");
  }

  const score = calculateFitnessScore(checks);
  const level = fitnessLevel(score, blockers.length);
  const { platform, rationale } = recommendPlatform(workload, level);

  let effort: ContainerFitnessReport["estimatedContainerisationEffort"];
  if (blockers.length > 0) {
    effort = "Not Recommended";
  } else if (remediationItems.length === 0 && workload.isAlreadyContainerised) {
    effort = "Low";
  } else if (remediationItems.length <= 2) {
    effort = "Low";
  } else if (remediationItems.length <= 4) {
    effort = "Medium";
  } else {
    effort = "High";
  }

  return {
    workloadName: workload.name,
    fitnessScore: score,
    fitnessLevel: level,
    recommendedPlatform: platform,
    platformRationale: rationale,
    twelveFactorChecks: checks,
    blockers,
    remediationItems,
    estimatedContainerisationEffort: effort,
  };
}
