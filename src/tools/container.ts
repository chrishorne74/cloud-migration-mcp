import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { assessContainerFitness } from "../lib/container-fitness.js";
import { loadCriteria } from "../lib/scoring.js";
import { getCriteriaPath } from "./assessment.js";

const ContainerWorkloadSchema = z.object({
  name: z.string().describe("Workload / application name"),
  description: z.string().optional(),
  technology: z.string().optional().describe("Primary technology stack, e.g. 'Java 17', '.NET 8', 'Node.js 20'"),
  operatingSystem: z.string().optional(),
  businessCriticality: z.number().min(1).max(5).optional(),
  dependencyCount: z.number().min(0).optional(),
  sourceCodeAvailable: z.boolean().optional(),

  // Container fitness fields
  isStateless: z.boolean().optional().describe("Does the application process requests statelessly (no in-memory session state)?"),
  configViaEnvVars: z.boolean().optional().describe("Is all configuration injected via environment variables (not hardcoded)?"),
  hasHealthCheckEndpoint: z.boolean().optional().describe("Does the application expose a /health or /ready HTTP endpoint?"),
  hasStructuredLogging: z.boolean().optional().describe("Does the application write logs to stdout/stderr (not local files)?"),
  runsAsNonRootUser: z.boolean().optional().describe("Does the application run as a non-root user?"),
  hasDockerfile: z.boolean().optional().describe("Is a Dockerfile or container image build definition already present?"),
  isAlreadyContainerised: z.boolean().optional().describe("Is the application already containerised (Docker, Podman, etc.)?"),
  existingContainerPlatform: z.string().optional().describe("Existing container platform if already containerised, e.g. 'Docker Compose', 'OpenShift', 'Rancher'"),
  requiresPrivilegedMode: z.boolean().optional().describe("Does the application require privileged mode or host networking inside a container?"),
  hasWindowsOnlyDependencies: z.boolean().optional().describe("Does the application have Windows-only dependencies (.NET Framework, COM, Windows Registry)?"),
  hasLocalFilesystemDependency: z.boolean().optional().describe("Does the application write persistent state to the local filesystem?"),
  hasComDcomDependency: z.boolean().optional().describe("Does the application use COM, DCOM, or ActiveX?"),
  hasPhysicalHardwareDependency: z.boolean().optional().describe("Does the application depend on physical hardware (dongles, FPGAs, etc.)?"),
  hasCustomKernelModules: z.boolean().optional().describe("Does the application require custom kernel modules?"),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerContainerTools(server: McpServer): void {
  server.tool(
    "assess_containerisation_fitness",
    "Assess an application's fitness for containerisation using 12-factor app principles and container security standards (CIS Docker Benchmark, Kubernetes Pod Security Standards). " +
      "Returns a fitness score (0–100), container platform recommendation (EKS/AKS/GKE, ECS/Cloud Run, Windows Containers, or Not Suitable), " +
      "12-factor compliance check results, blockers, and a prioritised remediation list. " +
      "Use before assigning a Replatform strategy or planning a containerisation workstream.",
    { workload: ContainerWorkloadSchema },
    async ({ workload }) => {
      const criteriaDoc = loadCriteria(getCriteriaPath());
      const weightsMap: Record<string, number> = {};
      for (const c of criteriaDoc.criteria) {
        if (c.id.startsWith("CON-")) weightsMap[c.id] = c.weight;
      }
      const report = assessContainerFitness(workload as WorkloadInput, weightsMap);

      const levelEmoji =
        report.fitnessLevel === "Excellent" ? "✅"
        : report.fitnessLevel === "Good" ? "🟢"
        : report.fitnessLevel === "Moderate" ? "🟡"
        : report.fitnessLevel === "Poor" ? "🟠"
        : "🔴";

      const lines: string[] = [
        `# Containerisation Fitness Assessment: ${report.workloadName}\n`,
        `## Summary`,
        `${levelEmoji} **Fitness Level:** ${report.fitnessLevel} (Score: ${report.fitnessScore}/100)`,
        `**Recommended Platform:** ${report.recommendedPlatform}`,
        `**Containerisation Effort:** ${report.estimatedContainerisationEffort}`,
        "",
        `> ${report.platformRationale}`,
        "",
      ];

      if (report.blockers.length > 0) {
        lines.push("## 🔴 Blockers — Cannot Containerise Until Resolved\n");
        for (const b of report.blockers) lines.push(`- ❌ ${b}`);
        lines.push("");
      }

      lines.push("## 12-Factor Compliance Checks\n");
      lines.push("| Factor | Status | Detail |");
      lines.push("|---|---|---|");
      for (const check of report.twelveFactorChecks) {
        const emoji = check.status === "Pass" ? "✅" : check.status === "Fail" ? "❌" : "❓";
        lines.push(`| ${check.factor} | ${emoji} ${check.status} | ${check.detail.slice(0, 120)}${check.detail.length > 120 ? "…" : ""} |`);
      }
      lines.push("");

      if (report.remediationItems.length > 0) {
        lines.push(`## Remediation Required (${report.remediationItems.length} items)\n`);
        for (let i = 0; i < report.remediationItems.length; i++) {
          lines.push(`${i + 1}. ${report.remediationItems[i]}`);
        }
        lines.push("");
      } else if (report.blockers.length === 0) {
        lines.push("## ✅ No Remediation Required\nApplication meets containerisation prerequisites.");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
