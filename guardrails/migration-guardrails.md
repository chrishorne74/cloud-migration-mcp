# Cloud Migration Guardrails

These rules govern how workloads are assessed and grouped for cloud migration.
Rules are organised by category. Each rule has a unique ID, severity, and recommendation.
Edit this file to add, modify, or remove guardrails. Run `reload_migration_guardrails` to apply changes.

Severity levels: CRITICAL | HIGH | MEDIUM | LOW

---

## Dependency

<!-- MG-DEP-001 | CRITICAL -->
**Keep application and database tiers together**
Application tiers and their primary databases must be migrated in the same wave.
Splitting application logic from its database across migration waves creates dual-write complexity, network latency, and data consistency risks.
Recommendation: Group each application with all databases it directly owns into the same migration wave. Use strangler-fig pattern if decoupling is necessary.

<!-- MG-DEP-002 | CRITICAL -->
**Migrate tightly coupled services together**
Services that communicate synchronously (REST/gRPC/SOAP with sub-100ms SLA) must be co-located in the same wave and ideally the same target region.
Crossing environment boundaries with synchronous calls during migration causes timeout and latency failures.
Recommendation: Identify all synchronous call chains and ensure they land in the same migration wave. Introduce an API gateway or circuit breaker if decoupling is required.

<!-- MG-DEP-003 | HIGH -->
**Resolve circular dependencies before migration**
Applications with circular dependencies must have those dependencies resolved prior to migration.
Circular dependencies prevent independent deployment and scaling and increase migration blast radius.
Recommendation: Introduce an event bus or shared domain service to break circular dependencies before the migration wave begins.

<!-- MG-DEP-004 | HIGH -->
**Shared infrastructure must be migrated first**
Shared services (AD/LDAP, DNS, NTP, PKI, monitoring) that downstream workloads depend on must be migrated in an earlier wave or replicated to the cloud environment before dependent workloads move.
Recommendation: Include shared infrastructure in Wave 0 or establish cloud-side equivalents (e.g. AWS Managed AD, Azure AD DS) before dependent workload waves.

<!-- MG-DEP-005 | MEDIUM -->
**Validate integration points before cutover**
All external integration points (APIs, file drops, MQ, EDI) must be validated in the target environment with end-to-end tests before cutover.
Recommendation: Create an integration test checklist and run smoke tests against all integration endpoints in the target environment 48 hours before cutover.

---

## Security

<!-- MG-SEC-001 | CRITICAL -->
**Establish cloud security baseline before first workload migrates**
IAM roles, network security groups, VPC/VNet design, encryption policies, and logging must be in place before any production workload is migrated.
Migrating workloads into an unsecured landing zone exposes them to immediate risk.
Recommendation: Complete Cloud Landing Zone (CLZ) deployment and pass a security review before any Wave 1 migration begins.

<!-- MG-SEC-002 | CRITICAL -->
**Encrypt data in transit and at rest in the target environment**
All migrated workloads must use TLS 1.2+ for data in transit and AES-256 (or cloud-native equivalent) for data at rest.
Recommendation: Enforce encryption via cloud policy (AWS SCPs, Azure Policy, GCP Org Policy) before migration and validate with a compliance scan post-migration.

<!-- MG-SEC-003 | HIGH -->
**Secrets must not be migrated as plain text**
Credentials, API keys, and certificates must be rotated and stored in a cloud secrets manager (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) — never migrated as environment variables or config files.
Recommendation: Scan source systems for hardcoded credentials before migration. Onboard all secrets to the target secrets manager and update application config prior to cutover.

<!-- MG-SEC-004 | HIGH -->
**Least-privilege IAM must be configured per workload**
Each migrated workload must use a dedicated IAM identity with only the permissions required for its function.
Recommendation: Define IAM roles per workload during wave planning. Reject any workload migration that requests admin-level cloud permissions.

<!-- MG-SEC-005 | HIGH -->
**Restricted data classification requires additional controls**
Workloads handling Restricted or PII data must have Data Loss Prevention (DLP) controls, enhanced logging, and access reviews configured before cutover.
Recommendation: Run a data classification scan on the source workload. Engage the security team for sign-off on restricted-data workloads before migration.

<!-- MG-SEC-006 | MEDIUM -->
**Vulnerability assessment required before migration**
Workloads must pass a vulnerability assessment in the source environment. Critical/High CVEs must be remediated before migration.
Recommendation: Run a vulnerability scan (e.g. Qualys, Tenable, AWS Inspector) at least 2 weeks before the planned migration date and remediate all Critical/High findings.

---

## Compliance

<!-- MG-CMP-001 | CRITICAL -->
**Data residency requirements must be met**
Workloads subject to data residency regulations (GDPR, Australian Privacy Act, PDPA) must land in cloud regions that satisfy the regulatory requirement.
Recommendation: Document data residency requirements per workload during assessment and validate the target region against the compliance mapping before wave planning.

<!-- MG-CMP-002 | CRITICAL -->
**PCI-DSS workloads require a QSA review before migration**
Any workload in scope for PCI-DSS must have the cloud target architecture reviewed by a Qualified Security Assessor before migration.
Recommendation: Engage QSA at architecture design stage, not post-migration. Separate CDE workloads into a dedicated wave with isolated network controls.

<!-- MG-CMP-003 | HIGH -->
**HIPAA workloads require a BAA with the cloud provider**
Workloads processing ePHI must only be hosted in cloud regions and services covered by the cloud provider's Business Associate Agreement.
Recommendation: Confirm BAA is in place and the target services are listed on the provider's HIPAA-eligible services list before wave planning.

<!-- MG-CMP-004 | HIGH -->
**Audit logging must be enabled for all production workloads**
CloudTrail (AWS), Activity Log (Azure), or Cloud Audit Logs (GCP) must be enabled and retained for at least 12 months for all migrated production workloads.
Recommendation: Enforce audit logging via cloud policy as part of the Landing Zone. Validate logging in the target environment before cutover.

<!-- MG-CMP-005 | MEDIUM -->
**Software licence compliance must be verified before migration**
BYOL (Bring Your Own Licence) eligibility must be confirmed with the software vendor before using existing licences in the cloud.
Recommendation: Conduct a licence audit during assessment. Identify applications requiring new cloud licences or SaaS replacements.

---

## Data

<!-- MG-DAT-001 | CRITICAL -->
**Data integrity must be validated after migration**
Row counts, checksums, and functional smoke tests must confirm data integrity in the target environment before decommissioning the source.
Recommendation: Define a data validation runbook per workload. Do not decommission source systems until the data validation pass is signed off.

<!-- MG-DAT-002 | HIGH -->
**Production data must not be used in non-production environments without masking**
Data copied to dev/test environments during migration testing must be masked or anonymised.
Recommendation: Use a data masking tool (e.g. Delphix, AWS DMS with transformation rules) when copying production data to non-production environments.

<!-- MG-DAT-003 | HIGH -->
**Backup and recovery must be tested in the target environment**
Backup procedures and recovery time objectives (RTO/RPO) must be validated in the target cloud environment before production cutover.
Recommendation: Run a full backup and restore test in the target environment as part of the migration dry run.

<!-- MG-DAT-004 | MEDIUM -->
**Large datasets require offline or hybrid migration approach**
Datasets larger than 10 TB should use an offline transfer service (AWS Snowball, Azure Data Box, Google Transfer Appliance) rather than online transfer over the internet.
Recommendation: Calculate transfer time during assessment. If estimated online transfer exceeds 72 hours, plan an offline transfer.

<!-- MG-DAT-005 | MEDIUM -->
**Database versions should be upgraded during migration where feasible**
Databases running end-of-life versions should be upgraded to a supported version as part of the migration.
Recommendation: Assess database version support status during workload assessment. Include database upgrade in the migration plan where the source is EOL.

---

## Architecture

<!-- MG-ARC-001 | HIGH -->
**Target architecture must pass cloud landing zone standards**
All migrated workloads must conform to the cloud landing zone design (network topology, naming conventions, tagging, CIDR allocation).
Recommendation: Validate target architecture against the landing zone design document before committing to a wave. Use the cloud-architecture-mcp to review against guardrails.

<!-- MG-ARC-002 | HIGH -->
**Single points of failure must be addressed in target architecture**
Workloads with SPOFs in the source environment should remediate them in the target design, not simply replicate the SPOF to the cloud.
Recommendation: For each migrated workload, identify SPOFs and document whether they are resolved, accepted with a risk sign-off, or deferred.

<!-- MG-ARC-003 | MEDIUM -->
**Stateful applications require persistent storage configuration**
Applications with stateful requirements must have persistent storage (EBS, Azure Disk, Persistent Disk) or managed storage services configured and tested before cutover.
Recommendation: Identify stateful vs stateless workloads during assessment. Validate storage performance (IOPS, throughput) in the target environment during dry run.

<!-- MG-ARC-004 | MEDIUM -->
**Legacy OS and middleware should be upgraded where migration effort is similar**
If upgrading a legacy OS or middleware adds less than 20% to the overall migration effort, it should be included in the migration scope.
Recommendation: During replatforming workloads, evaluate whether OS/middleware upgrade is feasible within the migration window.

<!-- MG-ARC-005 | LOW -->
**Observability must be configured for all migrated workloads**
Metrics, logs, and traces must be forwarded to the target cloud monitoring platform before go-live.
Recommendation: Include observability configuration (CloudWatch, Azure Monitor, Cloud Operations Suite) in the migration runbook for every workload.

---

## Operations

<!-- MG-OPS-001 | CRITICAL -->
**A rollback plan must exist for every production migration**
Every production workload migration must have a documented, tested rollback plan that allows reversion to source within the defined RTO.
Recommendation: Define rollback triggers, steps, and responsible parties in the migration runbook. Test the rollback procedure during the dry run.

<!-- MG-OPS-002 | HIGH -->
**Cutover windows must be scheduled during low-traffic periods**
Production cutovers must be scheduled during the workload's lowest traffic window to minimise impact.
Recommendation: Obtain traffic data from application monitoring before scheduling cutover. Notify stakeholders at least 5 business days in advance.

<!-- MG-OPS-003 | HIGH -->
**Hypercare period required post-migration**
A minimum 2-week hypercare period with enhanced monitoring and on-call support is required after each production wave cutover.
Recommendation: Define hypercare SLAs, escalation paths, and exit criteria before the migration. Keep source systems warm during hypercare.

<!-- MG-OPS-004 | MEDIUM -->
**Migration runbooks must be reviewed by operations team**
Migration runbooks must be reviewed and signed off by the operations team at least 5 business days before execution.
Recommendation: Include operations team in runbook reviews during wave planning. Use a runbook template to ensure consistency across workloads.

<!-- MG-OPS-005 | MEDIUM -->
**DNS cutover strategy must be defined**
A DNS cutover strategy (TTL reduction, health-check-based failover) must be documented and tested for every workload.
Recommendation: Reduce DNS TTLs to 60 seconds at least 48 hours before cutover. Validate DNS resolution in the target environment before switching.

---

## Cost

<!-- MG-CST-001 | HIGH -->
**Cost baseline must be established before migration**
The current on-premises or hosted cost (compute, storage, network, licensing, support) must be documented before migration to enable ROI measurement.
Recommendation: Use the estimate_migration_cost tool or cloud pricing calculators to produce a pre/post cost comparison during assessment.

<!-- MG-CST-002 | HIGH -->
**Right-sizing must be performed before migration**
Workloads must be right-sized based on actual utilisation data (CPU, memory, IOPS) from the source environment rather than provisioned capacity.
Recommendation: Collect at least 2 weeks of performance data from source systems. Use a right-sizing tool (AWS Compute Optimizer, Azure Advisor) or the MCP cost estimator.

<!-- MG-CST-003 | MEDIUM -->
**Reserved capacity or savings plans should be used for steady-state workloads**
Workloads with predictable, steady-state demand should be committed to Reserved Instances or Savings Plans to reduce costs by 30–60%.
Recommendation: Identify steady-state vs variable workloads during assessment. Recommend RI/SP commitments at 6–12 months post-migration when usage patterns are confirmed.

<!-- MG-CST-004 | MEDIUM -->
**Source environment decommission plan must be included in business case**
The cost savings from decommissioning source infrastructure must be included in the migration business case and tracked post-migration.
Recommendation: Set a decommission target date per workload (typically 30–90 days post-hypercare). Include decommission cost saving in ROI calculation.

---

## Custom

<!-- Add your organisation-specific guardrails below using the same format -->
<!-- MG-CUS-001 | MEDIUM -->
<!-- Example: All migrated workloads must use the approved tagging taxonomy -->
