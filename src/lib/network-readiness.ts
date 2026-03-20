import type { NetworkReadinessReport, NetworkReadinessGap, WorkloadInput } from "../types/index.js";

// ─── Gap definitions ──────────────────────────────────────────────────────────

export function assessNetworkReadiness(workload: WorkloadInput): NetworkReadinessReport {
  const gaps: NetworkReadinessGap[] = [];

  // ── Landing zone ──────────────────────────────────────────────────────────
  if (workload.hasLandingZoneDeployed === false) {
    gaps.push({
      area: "Landing Zone",
      severity: "CRITICAL",
      description: "No cloud landing zone deployed. A landing zone (VPC/VNet, IAM baseline, centralised logging, DNS resolver, network firewall) must be in place before any workload migration. Migrating without a landing zone creates ungoverned environments that accumulate security debt.",
      action: "Deploy a cloud landing zone using AWS Control Tower, Azure Landing Zone (ALZ) accelerator, or Google Cloud Landing Zone before proceeding. Minimum: VPC, IAM baseline, CloudTrail/Monitor, centralised DNS, network peering.",
    });
  }

  // ── Connectivity ──────────────────────────────────────────────────────────
  if (!workload.connectivityMethod || workload.connectivityMethod === "none") {
    gaps.push({
      area: "Cloud Connectivity",
      severity: "CRITICAL",
      description: "No cloud connectivity method defined. Workloads requiring access to on-premises systems or users must have defined and tested network connectivity before migration.",
      action: "Select and provision connectivity: AWS Direct Connect (1–10 Gbps), Azure ExpressRoute (50 Mbps–10 Gbps), or GCP Cloud Interconnect (VLAN attachments). For lower bandwidth, IPSec VPN is acceptable for non-latency-sensitive workloads.",
    });
  } else if (workload.connectivityMethod === "internet") {
    gaps.push({
      area: "Cloud Connectivity",
      severity: "MEDIUM",
      description: "Internet-only connectivity is configured. This is insufficient for workloads requiring private, high-bandwidth, or low-latency connections to on-premises systems.",
      action: "Evaluate whether Direct Connect / ExpressRoute / Cloud Interconnect is required. Internet connectivity is acceptable for fully public workloads or those with no on-premises dependencies.",
    });
  } else if (workload.connectivityMethod === "vpn") {
    gaps.push({
      area: "Cloud Connectivity",
      severity: "LOW",
      description: "VPN connectivity is configured. IPSec VPN provides basic connectivity but has variable latency, bandwidth caps (~1.25 Gbps per tunnel), and no SLA guarantees.",
      action: "Verify VPN throughput meets workload requirements. For production workloads with SLA requirements, evaluate upgrading to Direct Connect / ExpressRoute / Cloud Interconnect.",
    });
  }

  if (workload.networkConnectivityTested === false) {
    gaps.push({
      area: "Connectivity Validation",
      severity: "HIGH",
      description: "Network connectivity to the cloud target environment has not been tested end-to-end. Untested connectivity paths are a common cause of Day 1 migration failures.",
      action: "Run end-to-end connectivity tests from on-premises to cloud target before migration wave. Test: DNS resolution, application port connectivity, latency baseline, and throughput under load.",
    });
  }

  // ── DNS ───────────────────────────────────────────────────────────────────
  if (workload.hasDnsStrategy === false) {
    gaps.push({
      area: "DNS Strategy",
      severity: "HIGH",
      description: "No DNS migration strategy defined. DNS misconfiguration is one of the top causes of post-cutover failures — applications cannot resolve cloud endpoints, or still resolve to on-premises after migration.",
      action: "Define DNS strategy: split-horizon DNS (on-premises resolvers forward cloud zones to Route 53 Resolver / Azure Private DNS / Cloud DNS), TTL reduction plan (reduce to 60s 24 hours before cutover), and reverse DNS for cloud IPs. Document DNS cutover as a formal cutover step.",
    });
  }

  // ── Firewall rules ────────────────────────────────────────────────────────
  if ((workload.firewallRuleCount ?? 0) > 200) {
    gaps.push({
      area: "Firewall Rule Migration",
      severity: "HIGH",
      description: `${workload.firewallRuleCount} firewall rules require translation to cloud security groups/NSGs/VPC firewall rules. Large rule sets take significant effort to translate accurately and are prone to both over-permissive and under-permissive configurations.`,
      action: "Use AlgoSec, FireMon, or AWS Network Firewall policy analysis tools to audit and rationalise firewall rules before migration. Eliminate unused rules and duplicates. Translate remaining rules to cloud-native security group format. Test rule set in non-production before applying to production.",
    });
  } else if ((workload.firewallRuleCount ?? 0) > 50) {
    gaps.push({
      area: "Firewall Rule Migration",
      severity: "MEDIUM",
      description: `${workload.firewallRuleCount} firewall rules require translation. Moderate effort — plan 1–2 days for translation and testing.`,
      action: "Translate firewall rules to cloud security groups/NSGs. Use least-privilege as the default. Test connectivity after applying rules in non-production environment.",
    });
  }

  // ── Private endpoints ─────────────────────────────────────────────────────
  if (
    workload.dataClassification &&
    ["confidential", "restricted"].includes(workload.dataClassification) &&
    workload.connectivityMethod !== "direct-connect" &&
    workload.connectivityMethod !== "expressroute" &&
    workload.connectivityMethod !== "cloud-interconnect"
  ) {
    gaps.push({
      area: "Private Endpoints / PrivateLink",
      severity: "HIGH",
      description: `Workload handles ${workload.dataClassification} data but does not have dedicated private connectivity. Cloud managed service traffic (S3, Azure SQL, Cloud Storage) must flow over private endpoints — not the public internet — for confidential/restricted data.`,
      action: "Configure AWS PrivateLink / VPC Endpoints, Azure Private Endpoints, or GCP Private Service Connect for all managed services (storage, database, secrets manager, container registry). Ensure security groups restrict access to private endpoints only.",
    });
  }

  // ── Latency validation ────────────────────────────────────────────────────
  if (workload.latencyRequirementMs !== undefined && workload.latencyRequirementMs < 50) {
    if (workload.connectivityMethod === "internet" || workload.connectivityMethod === "vpn" || !workload.connectivityMethod) {
      gaps.push({
        area: "Latency SLA Validation",
        severity: "HIGH",
        description: `Workload requires ${workload.latencyRequirementMs}ms latency but connectivity method does not guarantee sub-50ms performance. Internet/VPN connectivity has variable latency and is unsuitable for tight SLA requirements.`,
        action: "Provision dedicated cloud interconnect (Direct Connect, ExpressRoute, or Cloud Interconnect) and conduct latency testing under representative load before migration. Document measured latency in test environment as evidence.",
      });
    }
  }

  // ── Network topology documentation ───────────────────────────────────────
  if (!workload.hasLandingZoneDeployed && !workload.networkConnectivityTested) {
    gaps.push({
      area: "Network Design Documentation",
      severity: "MEDIUM",
      description: "No evidence of network topology design or documentation for the cloud environment.",
      action: "Produce a network architecture diagram showing: VPC/VNet design (CIDR ranges, subnets), connectivity method, routing tables, security group/NSG baseline, DNS resolver configuration, and NAT/internet gateway placement.",
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const criticals = gaps.filter((g) => g.severity === "CRITICAL").length;
  const highs = gaps.filter((g) => g.severity === "HIGH").length;
  const mediums = gaps.filter((g) => g.severity === "MEDIUM").length;
  const lows = gaps.filter((g) => g.severity === "LOW").length;

  let score = 100;
  score -= criticals * 30;
  score -= highs * 15;
  score -= mediums * 8;
  score -= lows * 3;
  score = Math.max(0, score);

  let overallReadiness: NetworkReadinessReport["overallReadiness"];
  if (criticals > 0 || score < 40) overallReadiness = "Not Ready";
  else if (highs > 1 || score < 70) overallReadiness = "Needs Work";
  else overallReadiness = "Ready";

  const recommendations: string[] = [];
  if (criticals > 0) recommendations.push("Resolve all CRITICAL network gaps before any workload migration begins.");
  if (!workload.hasLandingZoneDeployed) recommendations.push("Deploy cloud landing zone as the first action — all other migration work depends on it.");
  if (!workload.hasDnsStrategy) recommendations.push("Define and test DNS strategy with reduced TTLs at least 48 hours before migration cutover.");
  if (workload.networkConnectivityTested === false) recommendations.push("Complete end-to-end connectivity testing and document latency/throughput baselines.");
  if (gaps.length === 0) recommendations.push("Network readiness checks passed. Confirm connectivity test results are documented for the migration runbook.");

  return {
    workloadName: workload.name,
    overallReadiness,
    readinessScore: score,
    gaps,
    recommendations,
  };
}
