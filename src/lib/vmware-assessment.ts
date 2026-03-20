import type {
  VMwareAssessmentReport,
  VMwareRecommendation,
  VMwareRisk,
  WorkloadInput,
} from "../types/index.js";

// ─── VMware recommendation logic ──────────────────────────────────────────────

export function assessVmwareEstate(workload: WorkloadInput): VMwareAssessmentReport {
  const risks: VMwareRisk[] = [];
  const rationale: string[] = [];
  const toolingNotes: string[] = [];

  const isVmware = /vmware|vsphere|vcenter/i.test(workload.hypervisorType ?? "");
  const isHyperV = /hyper-v|hyperv/i.test(workload.hypervisorType ?? "");
  const vmCount = workload.vmCount ?? 0;
  const vSphereVersion = workload.vSphereVersion ?? "";
  const usesVsan = workload.usesVsan ?? false;
  const usesNsxt = workload.usesNsxt ?? false;
  const usesVmwareCertifiedApps = workload.usesVmwareCertifiedApps ?? false;

  // ── Parse vSphere version ─────────────────────────────────────────────────
  const vSphereVersionNum = parseFloat(vSphereVersion);
  const isOldVsphere = vSphereVersionNum > 0 && vSphereVersionNum < 7.0;
  const isModernVsphere = vSphereVersionNum >= 7.0;

  // ── Risk: old vSphere ─────────────────────────────────────────────────────
  if (isOldVsphere) {
    risks.push({
      area: "vSphere Version",
      severity: "HIGH",
      description: `vSphere ${vSphereVersion} is below the minimum supported version for VMware HCX (7.0+ preferred, 6.5 minimum with limitations). HCX is the primary tool for VMC/AVS/GCVE migration.`,
      recommendation: "Upgrade vSphere to 7.0 Update 3 or later before using HCX for cloud migration. Alternatively use VMware Live Migrate (requires vSphere 8.0+) or cold migration via OVF export.",
    });
  }

  // ── Risk: vSAN ────────────────────────────────────────────────────────────
  if (usesVsan) {
    risks.push({
      area: "vSAN Storage",
      severity: "MEDIUM",
      description: "vSAN is in use for storage. VMware Cloud on AWS and GCVE use vSAN internally but the on-premises vSAN configuration does not directly transfer — storage policies must be reconfigured in the cloud SDDC.",
      recommendation: "Document vSAN storage policies (RAID level, FTT, deduplication, compression settings). Recreate equivalent policies in the target cloud SDDC before migrating VMs. Validate I/O performance meets workload requirements post-migration.",
    });
  }

  // ── Risk: NSX-T ───────────────────────────────────────────────────────────
  if (usesNsxt) {
    risks.push({
      area: "NSX-T Network Virtualisation",
      severity: "MEDIUM",
      description: "NSX-T is in use for network virtualisation. VMC on AWS and AVS include NSX-T, but network segment configurations, distributed firewall rules, and load balancer configurations must be recreated in the cloud SDDC.",
      recommendation: "Export NSX-T distributed firewall policy and segment configuration. Map on-premises NSX segments to cloud SDDC segments using HCX Network Extension during migration. Plan NSX-T config validation as a dedicated pre-migration milestone.",
    });
  }

  // ── Risk: certified apps ──────────────────────────────────────────────────
  if (usesVmwareCertifiedApps) {
    risks.push({
      area: "VMware-Certified Applications",
      severity: "HIGH",
      description: "Applications are VMware-certified (e.g. SAP on VMware, Oracle on VMware). These certifications are tied to specific hardware profiles and SDDC configurations. Migrating to a different hypervisor or bare metal cloud invalidates certification.",
      recommendation: "Verify VMware Cloud on AWS / AVS / GCVE is on the vendor certification matrix for each application. For SAP: consult SAP Certified Infrastructure on Cloud. For Oracle: validate Oracle LMS compliance before migration.",
    });
  }

  // ── Risk: large estate ────────────────────────────────────────────────────
  if (vmCount > 500) {
    risks.push({
      area: "Estate Scale",
      severity: "MEDIUM",
      description: `Large VM estate (${vmCount} VMs). Migrations of this scale require a phased approach with parallel HCX replication streams, dedicated wave planning, and extended testing windows.`,
      recommendation: "Plan migration in waves of 50–100 VMs. Use HCX Bulk Migration for non-production VMs first. Reserve vMotion for production VMs during maintenance windows. Allow 3–6 months for a 500+ VM estate.",
    });
  }

  // ── Recommendation logic ──────────────────────────────────────────────────
  let recommendation: VMwareRecommendation;
  let complexity: VMwareAssessmentReport["estimatedComplexity"];
  let estimatedWeeks: number;

  if (!isVmware && !isHyperV) {
    // Non-VMware hypervisor (KVM, Nutanix, Xen) — no Relocate path, recommend Rehost
    recommendation = "Rehost — Native IaaS (lift-and-shift to VMs)";
    rationale.push(`Hypervisor type (${workload.hypervisorType ?? "unknown"}) is not VMware — VMware Cloud solutions (VMC/AVS/GCVE) are not applicable.`);
    rationale.push("Rehost to native IaaS using cloud migration tools: AWS MGN, Azure Migrate, or GCP Migrate to VMs.");
    toolingNotes.push("AWS Application Migration Service (MGN) — continuous replication for any x86 workload.");
    toolingNotes.push("Azure Migrate — supports Hyper-V, KVM, and physical server sources.");
    toolingNotes.push("GCP Migrate to Virtual Machines — supports VMware, Hyper-V, AWS, and Azure sources.");
    complexity = vmCount > 200 ? "High" : vmCount > 50 ? "Medium" : "Low";
    estimatedWeeks = Math.max(4, Math.ceil(vmCount / 20));
  } else if (isHyperV) {
    recommendation = "Rehost — Native IaaS (lift-and-shift to VMs)";
    rationale.push("Hyper-V is not supported by VMware Cloud solutions — use Azure Migrate for Hyper-V-to-Azure migration (native tooling) or AWS MGN for AWS.");
    toolingNotes.push("Azure Migrate: Server Migration — native Hyper-V support via replication appliance.");
    toolingNotes.push("AWS MGN — supports Hyper-V as a source.");
    complexity = vmCount > 200 ? "High" : vmCount > 50 ? "Medium" : "Low";
    estimatedWeeks = Math.max(4, Math.ceil(vmCount / 15));
  } else if (isOldVsphere && !isModernVsphere) {
    // Old vSphere — Relocate possible but requires upgrade path
    recommendation = "Rehost — Native IaaS (lift-and-shift to VMs)";
    rationale.push(`vSphere ${vSphereVersion} is below minimum recommended for HCX — Rehost via AWS MGN / Azure Migrate / GCP Migrate to VMs is lower-risk than upgrading vSphere first.`);
    rationale.push("If VMware cloud is strategically required, upgrade vSphere to 7.0+ first, then re-evaluate Relocate.");
    toolingNotes.push("AWS Application Migration Service (MGN) — supports vSphere 5.5+.");
    toolingNotes.push("Azure Migrate — supports vSphere 5.5+.");
    complexity = "Medium";
    estimatedWeeks = Math.max(6, Math.ceil(vmCount / 15));
  } else if (usesVmwareCertifiedApps && (usesVsan || usesNsxt)) {
    // Complex VMware estate with certified apps — Relocate to VMware cloud to avoid recertification
    recommendation = "Relocate — VMware Cloud on AWS (VMC on AWS)";
    rationale.push("VMware-certified applications require continued VMware hypervisor environment to maintain certification.");
    rationale.push("vSAN and/or NSX-T in use — VMware cloud solutions (VMC, AVS, GCVE) provide native vSAN and NSX-T, avoiding reconfiguration overhead.");
    rationale.push("VMware Cloud on AWS is the most mature VMware cloud offering with the widest certification coverage.");
    toolingNotes.push("VMware HCX — primary migration tool for vMotion and bulk migration to VMC/AVS/GCVE.");
    toolingNotes.push("VMware Site Recovery Manager (SRM) — if DR continuity is required during migration.");
    complexity = "High";
    estimatedWeeks = Math.max(12, Math.ceil(vmCount / 10));
  } else if (isVmware && isModernVsphere && vmCount > 0) {
    // Modern VMware, moderate complexity — Relocate recommended
    recommendation = "Relocate — VMware Cloud on AWS (VMC on AWS)";
    rationale.push(`Modern vSphere (${vSphereVersion}) is fully HCX-compatible — VMware HCX enables near-zero downtime vMotion to VMware Cloud.`);
    rationale.push("Relocate preserves existing VMware operational tooling, skills, and processes — lowest operational disruption.");
    rationale.push("VMware Cloud on AWS / AVS / GCVE allows parallel run with on-premises SDDC during migration, reducing risk.");
    if (vmCount <= 100) {
      rationale.push(`Small VM estate (${vmCount} VMs) — migration can be completed in a single wave using HCX Bulk Migration + vMotion.`);
    }
    toolingNotes.push("VMware HCX — vMotion (live migration) and Bulk Migration modes.");
    toolingNotes.push("VMware vSphere Replication — for asynchronous replication if HCX is not licensed.");
    toolingNotes.push("Consider Azure VMware Solution (AVS) if Azure is the strategic cloud, or GCVE for Google Cloud.");
    complexity = vmCount > 200 ? "High" : vmCount > 50 ? "Medium" : "Low";
    estimatedWeeks = Math.max(6, Math.ceil(vmCount / 15));
  } else if (usesVsan || usesNsxt) {
    // VMware but no decision-forcing factors — Replatform recommended to escape VMware licensing
    recommendation = "Replatform — Migrate off VMware to cloud-native";
    rationale.push("vSAN/NSX-T in use — migrating to VMware cloud solutions carries ongoing VMware licensing costs on top of cloud IaaS costs.");
    rationale.push("Replatforming to cloud-native IaaS (EC2, Azure VMs, GCE) eliminates VMware licensing overhead and provides better long-term cost profile.");
    rationale.push("Use AWS MGN, Azure Migrate, or GCP Migrate to VMs to convert VMware VMs to cloud-native instances.");
    toolingNotes.push("AWS Application Migration Service (MGN) — agent-based continuous replication, converts VMware VMs to EC2 instances.");
    toolingNotes.push("Azure Migrate: Server Migration — agentless VMware replication to Azure VMs.");
    toolingNotes.push("GCP Migrate to Virtual Machines — VMware vCenter integration.");
    complexity = vmCount > 200 ? "High" : "Medium";
    estimatedWeeks = Math.max(8, Math.ceil(vmCount / 12));
  } else {
    recommendation = "Rehost — Native IaaS (lift-and-shift to VMs)";
    rationale.push("Standard VMware estate without complex dependencies — Rehost to cloud-native IaaS is the simplest and most cost-effective path.");
    toolingNotes.push("AWS Application Migration Service (MGN).");
    toolingNotes.push("Azure Migrate: Server Migration.");
    toolingNotes.push("GCP Migrate to Virtual Machines.");
    complexity = vmCount > 200 ? "High" : vmCount > 50 ? "Medium" : "Low";
    estimatedWeeks = Math.max(4, Math.ceil(vmCount / 20));
  }

  return {
    workloadName: workload.name,
    recommendation,
    rationale,
    risks,
    estimatedComplexity: complexity,
    recertificationRequired: usesVmwareCertifiedApps,
    toolingNotes,
    estimatedWeeeksToRelocate: estimatedWeeks,
  };
}
