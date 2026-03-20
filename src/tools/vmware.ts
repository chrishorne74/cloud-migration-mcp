import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { assessVmwareEstate } from "../lib/vmware-assessment.js";

const VMwareWorkloadSchema = z.object({
  name: z.string().describe("Workload or VMware estate name"),
  hypervisorType: z.string().optional()
    .describe("Hypervisor type, e.g. 'VMware vSphere', 'Hyper-V', 'KVM', 'Nutanix AHV'"),
  vSphereVersion: z.string().optional()
    .describe("vSphere version string, e.g. '6.7', '7.0', '8.0'"),
  vmCount: z.number().min(0).optional()
    .describe("Number of VMs in scope for migration"),
  usesVsan: z.boolean().optional()
    .describe("Is VMware vSAN in use for storage?"),
  usesNsxt: z.boolean().optional()
    .describe("Is VMware NSX-T (network virtualisation) in use?"),
  usesVmwareCertifiedApps: z.boolean().optional()
    .describe("Are any applications VMware-certified (e.g. SAP on VMware, Oracle on VMware)? Recertification required if moving off VMware."),
  businessCriticality: z.number().min(1).max(5).optional(),
  complianceRequirements: z.array(z.string()).optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerVMwareTools(server: McpServer): void {
  server.tool(
    "assess_vmware_estate",
    "Assess a VMware estate for cloud migration strategy selection. " +
      "Determines whether to Relocate using VMware Cloud on AWS / Azure VMware Solution / Google Cloud VMware Engine (preserving VMware tooling via HCX), " +
      "Rehost to native cloud IaaS (AWS MGN / Azure Migrate / GCP Migrate), " +
      "Replatform (migrate off VMware to cloud-native), or Retain. " +
      "Considers vSphere version (HCX compatibility), vSAN storage, NSX-T network virtualisation, VMware-certified application recertification risk, " +
      "and VM estate scale. Returns recommendation, rationale, risk list, tooling notes, and estimated migration duration.",
    { workload: VMwareWorkloadSchema },
    async ({ workload }) => {
      const report = assessVmwareEstate(workload as WorkloadInput);

      const complexityEmoji =
        report.estimatedComplexity === "Low" ? "🟢"
        : report.estimatedComplexity === "Medium" ? "🟡"
        : "🔴";

      const riskEmoji = (s: string) => s === "HIGH" ? "🟠" : s === "MEDIUM" ? "🟡" : "🟢";

      const lines: string[] = [
        `# VMware Estate Assessment: ${report.workloadName}\n`,
        `## Recommendation\n`,
        `**${report.recommendation}**\n`,
        `${complexityEmoji} **Estimated Complexity:** ${report.estimatedComplexity}`,
        `**Estimated Duration:** ${report.estimatedWeeeksToRelocate} weeks`,
        `**VMware Recertification Required:** ${report.recertificationRequired ? "⚠️ Yes — validate certification with vendors" : "No"}`,
        "",
        `### Rationale\n`,
        ...report.rationale.map((r) => `- ${r}`),
        "",
      ];

      if (report.risks.length > 0) {
        lines.push(`## Risks (${report.risks.length})\n`);
        for (const risk of report.risks) {
          lines.push(`### ${riskEmoji(risk.severity)} ${risk.severity} — ${risk.area}`);
          lines.push(`**Issue:** ${risk.description}`);
          lines.push(`**Recommendation:** ${risk.recommendation}`);
          lines.push("");
        }
      }

      lines.push(`## Tooling Notes\n`);
      for (const note of report.toolingNotes) {
        lines.push(`- ${note}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
