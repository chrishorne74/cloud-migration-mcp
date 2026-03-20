import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkloadInput } from "../types/index.js";
import { assessNetworkReadiness } from "../lib/network-readiness.js";

const NetworkWorkloadSchema = z.object({
  name: z.string().describe("Workload or programme name"),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  complianceRequirements: z.array(z.string()).optional(),
  latencyRequirementMs: z.number().min(0).optional()
    .describe("Latency SLA requirement in milliseconds — used to validate connectivity method suitability"),
  connectivityMethod: z
    .enum(["internet", "vpn", "direct-connect", "expressroute", "cloud-interconnect", "none"])
    .optional()
    .describe("Primary connectivity method provisioned between on-premises and cloud"),
  hasDnsStrategy: z.boolean().optional()
    .describe("Has a DNS migration strategy been defined (split-horizon, TTL reduction plan, resolver rules)?"),
  firewallRuleCount: z.number().min(0).optional()
    .describe("Approximate number of on-premises firewall rules that need translation to cloud security groups/NSGs"),
  hasLandingZoneDeployed: z.boolean().optional()
    .describe("Has a cloud landing zone been deployed (VPC/VNet, IAM baseline, centralised logging, DNS, network firewall)?"),
  targetCloudRegion: z.string().optional()
    .describe("Target cloud region, e.g. 'eu-west-1', 'australiaeast', 'us-central1'"),
  networkConnectivityTested: z.boolean().optional()
    .describe("Has network connectivity been tested end-to-end to the target cloud environment?"),
  attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })).optional(),
});

export function registerNetworkTools(server: McpServer): void {
  server.tool(
    "assess_network_readiness",
    "Assess cloud network readiness for a workload or migration programme. " +
      "Evaluates: landing zone deployment, connectivity method (Direct Connect / ExpressRoute / VPN / internet), " +
      "DNS strategy, firewall rule migration complexity, private endpoint requirements for confidential data, " +
      "and latency SLA compatibility. " +
      "Returns a readiness score (0–100), gap list with severity and remediation actions, and prioritised recommendations. " +
      "Network issues are the #2 cause of migration delays — run this before committing a workload to a migration wave.",
    { workload: NetworkWorkloadSchema },
    async ({ workload }) => {
      const report = assessNetworkReadiness(workload as WorkloadInput);

      const readinessEmoji =
        report.overallReadiness === "Ready" ? "✅"
        : report.overallReadiness === "Needs Work" ? "⚠️"
        : "❌";

      const severityEmoji = (s: string) => s === "CRITICAL" ? "🔴" : s === "HIGH" ? "🟠" : s === "MEDIUM" ? "🟡" : "🟢";

      const lines: string[] = [
        `# Network Readiness Assessment: ${report.workloadName}\n`,
        `## Summary`,
        `${readinessEmoji} **Overall Readiness:** ${report.overallReadiness}`,
        `**Readiness Score:** ${report.readinessScore}/100`,
        `**Gaps Found:** ${report.gaps.length}`,
        "",
      ];

      if (report.gaps.length > 0) {
        lines.push("## Network Readiness Gaps\n");
        for (const gap of report.gaps) {
          lines.push(`### ${severityEmoji(gap.severity)} ${gap.severity} — ${gap.area}`);
          lines.push(`**Issue:** ${gap.description}`);
          lines.push(`**Action:** ${gap.action}`);
          lines.push("");
        }
      }

      lines.push("## Recommendations\n");
      for (const r of report.recommendations) {
        lines.push(`- ${r}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
