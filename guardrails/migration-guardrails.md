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

## Technical Red Flags

These guardrails identify technical characteristics that indicate a workload is a poor migration candidate or requires significant remediation before migration can proceed. Source: AWS MAP, Azure CAF, Google Cloud Adoption Framework, Gartner, IBM, DXC, TCS.

<!-- MG-TRF-001 | CRITICAL -->
**Workloads with physical hardware dependencies cannot be migrated to standard cloud IaaS**
Applications requiring physical hardware (security dongles, HSMs, FPGAs, specialised NICs, proprietary storage arrays, or specific PCI cards) have no standard cloud equivalent and cannot be lifted to IaaS.
Hardware-bound workloads will fail to start or function correctly in virtualised cloud environments. Migration without hardware remediation results in immediate post-cutover failure.
Recommendation: Identify hardware dependencies during discovery. Evaluate cloud-equivalent managed services (AWS CloudHSM, Azure Dedicated HSM, bare-metal cloud options). If no equivalent exists, assign Retain strategy. Document as a hard blocker in the migration plan.

<!-- MG-TRF-002 | CRITICAL -->
**Sub-millisecond latency workloads are not suitable for cloud migration without architectural redesign**
Applications with sub-millisecond latency SLAs (high-frequency trading, real-time industrial control systems, SCADA, CNC machine interfaces, hard real-time manufacturing control) cannot tolerate the network overhead of cloud infrastructure.
Internet-routed latency is incompatible with sub-millisecond SLA requirements. Migrating these workloads without addressing latency will cause SLA violations and operational failures.
Recommendation: Assign Retain strategy for sub-millisecond latency workloads. Evaluate AWS Outposts, Azure Stack, or GCP Distributed Cloud for edge deployments where latency constraints apply. Document latency SLA in the workload record.

<!-- MG-TRF-003 | CRITICAL -->
**Air-gapped or classified workloads require sovereign or dedicated hosting**
Workloads processing data classified above the available cloud certification level (e.g., Top Secret, SCI) or subject to sovereign hosting requirements where no qualifying cloud region exists cannot be migrated to standard public cloud regions.
Migrating classified or sovereign data to non-qualified cloud regions violates legal obligations and security clearances.
Recommendation: Validate data classification level against available cloud certifications (FedRAMP, IL4/IL5, IRAP, etc.) before assessment. Assign Retain for workloads exceeding available certifications. Explore AWS GovCloud, Azure Government, or national sovereign cloud options.

<!-- MG-TRF-004 | CRITICAL -->
**Software licences that prohibit cloud deployment are a hard migration blocker**
Some perpetual licences explicitly forbid cloud deployment or require renegotiation and significant licence uplift before cloud use. Migrating without confirming cloud licensing rights violates licence agreements.
Licence non-compliance carries legal risk and can result in audit findings, fines, or forced decommission post-migration.
Recommendation: Conduct a licence audit during assessment. Confirm cloud deployment rights with each software vendor before including in a migration wave. Document BYOL eligibility, SaaS alternatives, or licence renegotiation requirements per application.

<!-- MG-TRF-005 | CRITICAL -->
**End-of-support operating systems must be upgraded before or during migration**
Workloads running end-of-support operating systems (Windows Server 2003, Windows 2000, Solaris, HP-UX, AIX, Windows XP) have no ongoing security patches, no cloud agent support, and cannot receive Azure VM extensions or AWS SSM agent capabilities.
Migrating an unsupported OS to the cloud replicates an existing security liability, violates compliance baselines, and leaves the workload unmanageable through cloud tooling. Azure Migrate marks these as Conditionally Ready or Not Ready.
Recommendation: Upgrade OS as part of the migration (Replatform strategy) or as a pre-migration workstream. If upgrade is not feasible, assign Retain strategy with a documented risk acceptance. Windows Server 2003 requires a Custom Support Agreement for Azure migration.

<!-- MG-TRF-006 | HIGH -->
**Hardcoded IP addresses, server names, and UNC paths must be remediated before migration**
Applications with hardcoded private IP addresses, server hostnames, or Windows UNC paths (\\SERVER\share) will fail immediately after migration because cloud instances receive new IPs and DNS names.
This is the most common cause of application failure in the 48 hours post-cutover. Discovered in 38% of migration failures per Uptime Institute (2025).
Recommendation: Scan application code, configuration files, and registry entries for hardcoded network references during assessment. Use CAST Highlight, GitHub Copilot AppCAT, or equivalent tooling. Remediate before migration wave or accept and document as a post-migration Day 1 fix item.

<!-- MG-TRF-007 | HIGH -->
**Local filesystem and Windows Registry dependencies must be addressed before containerisation or replatforming**
Applications that write persistent state to local disk (C:\AppData, /tmp, local SQLite) or depend heavily on the Windows Registry cannot be containerised or made stateless without code changes.
Containers and auto-scaled cloud instances do not preserve local state between restarts. Applications with these patterns will lose data or fail on scale-out events.
Recommendation: Identify stateful local dependencies during discovery. Externalise state to managed storage (S3, Azure Blob, Cloud Storage, managed databases) as part of the Replatform or Refactor strategy. For Rehost, document local state as a post-migration risk.

<!-- MG-TRF-008 | HIGH -->
**COM, DCOM, and ActiveX dependencies prevent containerisation and complicate cloud-native deployment**
Applications with COM, DCOM, or ActiveX inter-process communication can only be deployed on Windows IaaS VMs. They cannot be containerised or replatformed to Linux-based managed services.
COM/DCOM adds licensing cost (Windows VMs only), limits scaling options, and prevents use of modern managed runtimes. These applications are candidates for Rehost-only or replacement.
Recommendation: Flag COM/DCOM/ActiveX usage during code assessment. Assign Rehost strategy targeting Windows IaaS. Include modernisation (removal of COM/DCOM) as a post-migration refactoring initiative if business value justifies it.

<!-- MG-TRF-009 | HIGH -->
**Zombie and idle applications should be evaluated for retirement before migration**
Applications where CPU and memory utilisation has been consistently below 5% for 90 days (zombie) or between 5–20% for 90 days (idle) with no inbound connections in 90 days are prime Retire candidates. Migrating these consumes migration effort with no business value.
The AWS Prescriptive Guidance and Gartner both identify 10–20% of typical enterprise application portfolios as zombie or idle. Retiring these before migration reduces wave complexity and direct costs.
Recommendation: Collect 90 days of CPU, memory, and network utilisation data during discovery. Flag applications meeting zombie/idle criteria for business owner confirmation of retirement. Do not include unconfirmed Retire candidates in migration waves.

<!-- MG-TRF-010 | HIGH -->
**Applications with no source code, documentation, or owner require remediation before migration**
Orphaned applications where no source code is accessible, no architectural documentation exists, and no application owner can be identified carry extreme migration risk. Discovery, dependency mapping, impact assessment, and rollback planning are all impossible without this information.
Per IBM Rapid Assessment methodology, these applications carry unlimited risk exposure. Migrating them relies entirely on institutional knowledge that may not exist.
Recommendation: Escalate undocumented orphaned applications for business owner identification. Do not include in migration waves until an owner is confirmed, architecture is reverse-engineered, and a dependency map is produced. Assign Retain or Retire as default pending investigation.

<!-- MG-TRF-011 | MEDIUM -->
**Non-x86 architectures require specialist migration tooling and assessment**
Applications running on IBM AS/400 (IBMi), Oracle Solaris SPARC, HP-UX Itanium, or mainframes (IBM z/OS) cannot be migrated using standard cloud migration tools (AWS MGN, Azure Migrate, Google Migrate for Compute Engine). Standard IaaS VMs do not support non-x86 instruction sets.
Applying standard migration tooling to non-x86 workloads will produce no usable output. These workloads require specialised assessment and migration paths.
Recommendation: Identify non-x86 platforms during infrastructure discovery. Engage specialist tooling and skills: IBM iProject, Stromasys CHARON for legacy SPARC/HP-UX, or mainframe modernisation tooling (Google AMTLZ, AWS Blu Age, Micro Focus). Treat as a separate workstream with dedicated assessment.

<!-- MG-TRF-012 | MEDIUM -->
**Using AWS Application Migration Service (MGN) for database workloads is an anti-pattern**
AWS MGN performs OS-level block replication and is designed for application server workloads, not databases. Using MGN for high-read/write database instances causes replication errors, extended cutover windows, and data loss risk.
Applying the wrong migration tool to databases is a documented AWS failure mode that produces inconsistent data or migration job failures.
Recommendation: Use native database replication tools for all database migrations: AWS DMS, Oracle Data Guard, SQL Server log shipping, MySQL replication, PostgreSQL logical replication. MGN is for OS-level server migration only.

---

## Organisational Red Flags

These guardrails identify organisational conditions that significantly increase migration failure risk. Source: Gartner (10 Common Cloud Strategy Mistakes, 6 Ways Cloud Migration Costs Go Off the Rails), Forrester, Accenture, AWS MAP.

<!-- MG-ORG-001 | CRITICAL -->
**Migration must not begin without a deployed cloud landing zone**
Migrating workloads before a cloud landing zone (VPC/VNet, IAM baseline, network security groups, DNS, monitoring, account structure) is deployed causes security gaps, identity failures, DNS resolution failures, and compliance violations that must be retrofitted post-migration.
This is the most commonly cited preventable migration failure mode across AWS, Azure, GCP, and major integrators. Azure CAF and AWS MAP both define landing zone deployment as a hard prerequisite for production workload migration.
Recommendation: Treat Landing Zone deployment as Wave 0. Do not begin Wave 1 until Landing Zone has passed a security review and connectivity has been validated end-to-end. Use AWS Control Tower, Azure Landing Zones (ALZ), or Google Cloud Landing Zone accelerators.

<!-- MG-ORG-002 | CRITICAL -->
**No executive sponsorship is a programme-level blocker**
Cloud migrations driven as purely IT-led cost-cutting exercises without business co-ownership consistently fail. Application owners block scope, prioritisation is impossible without business input, and escalation paths for blockers do not exist without executive mandate.
Gartner identifies this as mistake #1 of 10 common cloud strategy mistakes. AWS MAP explicitly requires executive buy-in as a gating criterion. Google Cloud Adoption Framework's "Lead" theme is a maturity gating factor.
Recommendation: Confirm executive sponsor before migration programme kickoff. Establish a steering committee with joint IT and business representation. Define escalation path from Day 1 with a maximum 48-hour SLA for blocker resolution.

<!-- MG-ORG-003 | HIGH -->
**No formal workload assessment phase is a leading indicator of cost overrun**
Proceeding directly from inventory to migration without a formal assessment phase (triage, scoring, dependency mapping, strategy assignment) results in incorrect wave sequencing, unexpected blockers, cost overruns, and scope instability.
Gartner identifies failing to assess workloads as one of the six root causes of cloud migration cost overruns. AWS MAP mandates a formal Assess phase before any migration execution. Post-migration cloud costs are on average 23% higher than estimated when workload assessment is skipped.
Recommendation: Complete a formal assessment phase covering all in-scope workloads before finalising wave plans. Use `assess_workload` or `score_migration_candidates` tools. Document exceptions and assumptions for any workload migrated without full assessment.

<!-- MG-ORG-004 | HIGH -->
**Business case must include indirect and residual costs**
Migration business cases that exclude operational transformation costs, residual data centre costs (rent, power, hardware refresh deferral), and post-migration optimisation costs consistently understate total programme cost by 30–50%.
Gartner identifies omission of indirect costs as one of the six root causes of cloud migration cost overruns. These costs are real and material — failing to budget for them causes mid-programme funding crises.
Recommendation: Include the following in the migration business case: operational transformation (retraining, process change), residual data centre costs (30–90 days post-hypercare before decommission), post-migration optimisation wave (right-sizing, reserved capacity), and programme management overhead.

<!-- MG-ORG-005 | HIGH -->
**Migration partner selection based on price or incumbent relationship without migration experience is high risk**
Selecting a migration delivery partner based on existing commercial relationships or lowest cost, rather than demonstrated cloud migration experience and methodology, is a leading predictor of cost overrun and schedule slippage.
Gartner identifies this as the #1 root cause in "6 Ways Cloud Migration Costs Go Off the Rails." Delivering a migration programme requires specialised skills distinct from general IT delivery or cloud consulting.
Recommendation: Evaluate migration partners on: number of migrations delivered, reference customers in similar industry, tooling and automation maturity, assessment methodology rigour, and certified migration competencies (AWS MSP/MAP, Microsoft Azure Expert MSP, Google Cloud Premier Partner).

<!-- MG-ORG-006 | HIGH -->
**Cloud skills gap must be assessed and a remediation plan in place before migration**
75% of organisations cite lack of cloud resources or expertise as their top cloud challenge (Flexera 2025). 70% of IT decision-makers report a skills gap. Migrating workloads to an environment the operations team cannot manage creates immediate post-migration risk.
Skills gaps are most acute in cloud security, infrastructure as code, and FinOps. Organisations without these skills will experience security incidents, runaway costs, and operational failures.
Recommendation: Conduct a cloud skills assessment covering: cloud architecture, IaC (Terraform/CloudFormation/Bicep), cloud security, FinOps, and cloud operations. Develop a training and hiring plan. Stand up a Cloud Centre of Excellence (CCoE) before Wave 1.

<!-- MG-ORG-007 | MEDIUM -->
**Dependency mapping must use tooling, not manual-only methods**
Manual-only dependency discovery produces low-confidence wave plans and is a root cause of post-cutover failures. 38% of failed migration projects cite unanticipated dependency conflicts (Uptime Institute 2025).
Manual discovery misses undocumented integrations, shared databases used by multiple applications, and informal file-drop integrations. Automated tools surface these reliably.
Recommendation: Use automated discovery tooling: AWS Application Discovery Service, Azure Migrate dependency analysis, Google Migration Center, or third-party tools (TDS TransitionManager, Flexera). Treat dependency maps as mandatory sign-off criteria before finalising wave composition.

<!-- MG-ORG-008 | MEDIUM -->
**Applying Refactor strategy to more than 15% of the migration portfolio stalls the programme**
Refactor/re-architect requires months to years of development effort per application. Applying it broadly during a migration programme destroys velocity and causes the entire programme to stall. AWS explicitly warns against this pattern.
AWS recommends: Rehost or Relocate first, modernise after. Reserve Refactor for maximum 10–15% of portfolio during the migration phase. Remaining modernisation should be a post-migration programme.
Recommendation: Flag workloads assigned Refactor strategy that exceed 15% of total portfolio for senior programme review. Consider splitting: Rehost now, Refactor in a subsequent modernisation programme. Only apply Refactor during migration where a business-critical capability gap makes it unavoidable.

---

## Mainframe

These guardrails are specific to mainframe modernisation programmes. Source: IBM, DXC, TCS, BMC, mLogica, Google Cloud Mainframe Assessment Tool.

<!-- MG-MF-001 | CRITICAL -->
**Mainframe programmes using Natural/Adabas require specialist assessment and extended timelines**
Natural (Software AG) application stacks running on Adabas databases have significantly fewer automated conversion tools than COBOL/VSAM/Db2 equivalents. Specialist skills are extremely scarce globally. Natural/Adabas programmes consistently exceed scope estimates.
Natural/Adabas is frequently excluded from initial scope estimates and discovered mid-programme, causing timeline and budget overruns.
Recommendation: Identify Natural and Adabas usage explicitly during mainframe discovery. Treat Natural/Adabas workloads as a separate workstream with dedicated assessment. Engage specialists with proven Natural/Adabas modernisation experience. Do not include in COBOL-based conversion timelines.

<!-- MG-MF-002 | CRITICAL -->
**Assembler code in production paths requires manual conversion — no automated tool handles this reliably**
IBM Assembler (BAL) in production code paths cannot be automatically converted to any modern language by any commercially available tool. Manual reverse engineering and rewrite is required.
Including Assembler in an automated conversion scope produces non-functional output. Vendors claiming automated Assembler conversion are misrepresenting their capabilities. Assembler in production paths is the most common cause of mainframe programme failure.
Recommendation: Inventory all Assembler modules during assessment. Classify each as: utility (replaceable with standard library), infrastructure (replaceable with cloud equivalent), or business logic (requires manual rewrite). Document Assembler scope explicitly in the programme plan and timeline.

<!-- MG-MF-003 | CRITICAL -->
**IDMS (network database) workloads have no direct cloud equivalent and require data model redesign**
CA IDMS (Integrated Database Management System) uses a network database model that has no managed cloud service equivalent. IDMS data must be migrated to a relational or NoSQL model, which requires significant data model redesign and application changes.
Programmes that do not account for IDMS migration complexity consistently overrun. IDMS migration is a multi-year effort for large implementations.
Recommendation: Inventory all IDMS databases and dependent COBOL programs during assessment. Engage IDMS-specialist consultants. Define a data model migration strategy (typically relational) and timeline separately from COBOL/CICS conversion. Do not merge IDMS migration into standard COBOL conversion estimates.

<!-- MG-MF-004 | CRITICAL -->
**Claim of full mainframe exit in under 12 months is a vendor red flag**
No credible mainframe modernisation programme of material scale can be completed in under 12 months. Institutional knowledge capture and batch equivalency testing alone require 6–9 months. Any vendor making this claim is misrepresenting the scope or planning a risky big-bang approach.
Programmes accepting vendor claims of sub-12-month full mainframe exits consistently fail, face significant cost overruns, and may cause production incidents.
Recommendation: Reject any vendor proposal claiming full mainframe exit in under 12 months for programmes involving more than 500K lines of code. Require vendors to provide documented reference customers who completed comparable scope in the claimed timeline. Engage an independent technical advisor to review vendor timeline claims.

<!-- MG-MF-005 | CRITICAL -->
**Claim of fully automated COBOL-to-Java conversion without manual review is a vendor red flag**
No tool achieves production-quality COBOL-to-Java conversion without significant manual review and testing. Vendors claiming 100% automated conversion with no human review are misrepresenting the technology. Machine-generated Java from COBOL is typically unmaintainable without refactoring.
Organisations accepting this claim receive generated code they cannot maintain, debug, or extend, negating the modernisation benefit.
Recommendation: Require all vendors to demonstrate converted code quality on a representative sample (minimum 5% of production code volume) before contract signature. Establish code quality gates: cyclomatic complexity, test coverage, and security scan results. Expect 30–50% human effort for review, refactoring, and test authoring on top of automated conversion.

<!-- MG-MF-006 | HIGH -->
**IMS DB/DC with complex hierarchical data requires separate assessment and extended timeline**
IBM IMS (Information Management System) uses a hierarchical database model. Migrating IMS DB data to a relational model requires schema redesign, data transformation, and application rewrite of all DL/I calls. This is equivalent to a database migration programme in its own right.
IMS is frequently underestimated in mainframe programmes. Including IMS in a standard COBOL/Db2 timeline without adjustment causes overrun.
Recommendation: Inventory all IMS databases and dependent programs separately. Engage IMS-specialist consultants. Estimate IMS migration separately from COBOL/CICS/Db2 conversion. Consider whether IMS data can be staged into Db2 as an interim step to decouple the database migration from the application migration.

<!-- MG-MF-007 | HIGH -->
**JCL with embedded business logic must be analysed and extracted before migration**
JCL (Job Control Language) in mainframe batch processing often contains implicit business logic (conditional step execution, return code handling, dataset manipulations) that is not documented as business rules. Migrating the JCL equivalent without extracting this logic produces incomplete target implementations.
Business logic hidden in JCL is discovered during UAT, causing rework and timeline extension. It is a top-5 cause of mainframe programme overrun.
Recommendation: Include JCL analysis in the mainframe discovery phase. Use automated JCL parsing tools (Google AMTLZ, IBM Watsonx Code Assistant for Z, Micro Focus Enterprise Analyzer) to identify embedded business logic. Document extracted logic in a business rules catalogue before conversion.

<!-- MG-MF-008 | HIGH -->
**Unknown batch window dependencies must be resolved before migration**
Mainframe batch jobs frequently have implicit time-based dependencies (job A must complete before job B starts based on schedule, not explicit dependency declarations). These are not captured in JCL and require observation of production batch runs to document.
Batch jobs migrated without capturing time-based dependencies fail in production because the dependency graph is incomplete. Batch window failures are the most common post-go-live incident type in mainframe migrations.
Recommendation: Observe and document production batch schedules for a minimum of 4 weeks (covering month-end, quarter-end, and year-end windows if applicable). Use workload automation tools (Control-M, TWS/z, Zena) to export job dependency definitions. Validate the target scheduler implements equivalent dependency chains before cutover.

<!-- MG-MF-009 | HIGH -->
**No structured knowledge capture methodology puts the programme at unlimited risk**
If the mainframe team retires or departs without a structured knowledge capture process, the programme loses the institutional knowledge required to validate the correctness of migrated outputs. Business logic encoded in 30–40-year-old COBOL cannot be reconstructed from code alone.
Post-retirement knowledge gaps are unrecoverable. A single undocumented rule embedded in a COBOL copybook can cause regulatory or financial reporting failures post-migration.
Recommendation: Begin structured knowledge capture from Day 1, before any conversion work starts. Interview subject matter experts and record business rules, data meanings, known exceptions, and seasonal variations. Use business rule extraction tools as a supplement, not a replacement. Treat knowledge capture as a critical path activity.

<!-- MG-MF-010 | MEDIUM -->
**"Last mile" languages (PL/I, Easytrieve, Telon, RPG) excluded from scope cause programme failure**
Mainframe programmes scoped around COBOL/CICS/Db2 often exclude PL/I, Easytrieve, Telon, RPG, and other languages present in the estate. When discovered mid-programme, these create unplanned scope, cost, and timeline impacts.
Last-mile language exclusions are in the top 5 mainframe programme failure causes (BMC).
Recommendation: Include language inventory as a mandatory discovery step. Use automated scanning tools to identify every language present in the mainframe estate before scope is finalised. Explicitly include or exclude each language with documented rationale.

---

## Database Migration Red Flags

These guardrails capture database-specific technical blockers from Azure Migrate SQL Assessment, GCP Database Migration Service, and AWS DMS documentation.

<!-- MG-DB-001 | CRITICAL -->
**SQL Server FILESTREAM and FileTable features block migration to Azure SQL Managed Instance**
SQL Server databases using FILESTREAM or FileTable cannot be backed up and restored to Azure SQL Managed Instance. This is a hard technical blocker — there is no workaround short of removing FILESTREAM usage from the application and database.
Attempting to migrate a FILESTREAM database to Azure SQL MI fails at the restore step. Source: Microsoft Azure SQL Assessment documentation.
Recommendation: Detect FILESTREAM/FileTable usage during SQL assessment (Azure SQL Assessment, AWS Schema Conversion Tool). If present, migrate to SQL Server on Azure VM/EC2 instead of a managed instance, or remove FILESTREAM and replace with Blob Storage before migration.

<!-- MG-DB-002 | CRITICAL -->
**Oracle tables without primary keys cannot be reliably replicated by DMS**
Google Cloud DMS and AWS DMS cannot guarantee consistent replication for Oracle tables that lack primary keys. Row identification for CDC (Change Data Capture) depends on primary keys or supplemental logging. Absent both, DMS may replicate duplicate or missed rows.
Tables without primary keys will produce silent data integrity failures during DMS replication, which may not be detected until post-cutover data validation.
Recommendation: Identify all tables without primary keys during database assessment. Add primary keys or configure supplemental logging before initiating DMS replication. Validate row counts and checksums post-migration for all affected tables.

<!-- MG-DB-003 | CRITICAL -->
**Oracle ANYDATA type is unsupported by GCP DMS — affected tables cannot be replicated**
The Oracle ANYDATA data type is completely unsupported by Google Cloud DMS. Tables using ANYDATA cannot be replicated at all. This is a hard blocker, not a warning.
Source: Google Cloud DMS Oracle-to-AlloyDB and Oracle-to-PostgreSQL known limitations documentation.
Recommendation: Inventory all ANYDATA columns in Oracle schemas during assessment. These tables must be migrated via bulk export/import rather than DMS replication. Plan for downtime windows for ANYDATA table migration.

<!-- MG-DB-004 | CRITICAL -->
**Oracle Index-Organised Tables (IOTs) are not supported by GCP DMS**
Index-Organised Tables (IOTs) in Oracle are not supported by Google Cloud Database Migration Service. IOTs cannot be replicated using DMS and require alternative migration approaches.
Recommendation: Identify all IOTs using Oracle data dictionary queries during assessment. Plan bulk migration for IOTs outside the DMS replication stream. Validate data integrity independently.

<!-- MG-DB-005 | HIGH -->
**SQL Server with xp_cmdshell, CLR assemblies, or linked servers requires target validation**
SQL Server databases using xp_cmdshell, CLR assemblies (SAFE/EXTERNAL_ACCESS/UNSAFE), linked servers (especially to non-SQL providers), or BEGIN DISTRIBUTED TRANSACTION with non-SQL remote servers cannot migrate directly to Azure SQL Database. Azure SQL Managed Instance supports most of these features but requires validation.
Features that work in on-premises SQL Server may fail silently or behave differently in managed cloud SQL services.
Recommendation: Run Azure SQL Assessment or AWS Schema Conversion Tool against all SQL Server instances before migration. Review all assessment warnings (not just blockers). Test each flagged feature in the target environment during a dry run before production cutover.

<!-- MG-DB-006 | HIGH -->
**DDL changes during DMS replication cause migration job failure and require restart**
Any schema change (ALTER TABLE, CREATE INDEX, DROP COLUMN) made to the source database while a DMS migration job is replicating causes the job to fail or produce inconsistent data. This applies to AWS DMS and GCP DMS.
DDL changes during migration are a top-5 DMS failure mode. A failed DMS job during production cutover requires restart from full load, extending the cutover window significantly.
Recommendation: Implement a schema freeze on the source database for the duration of the migration. Communicate the freeze to all development teams at least 2 weeks before migration. Include schema freeze validation as a pre-cutover checklist item.

<!-- MG-DB-007 | HIGH -->
**Users, permissions, and service accounts are not migrated by DMS and must be recreated manually**
AWS DMS, GCP DMS, and Azure Database Migration Service do not migrate database users, roles, or permissions. Post-migration, all application service accounts, database users, and permission grants must be recreated manually in the target database.
Forgetting to recreate service accounts is a common cause of post-cutover application failures. The application connects but immediately fails authentication.
Recommendation: Document all database users, roles, and permission grants during assessment. Create an automated script to recreate them in the target. Test service account authentication in the target environment during the dry run. Include user validation in the cutover checklist.

<!-- MG-DB-008 | MEDIUM -->
**Databases with sequential auto-increment primary keys migrating to Spanner require key redesign**
Sequential integer primary keys (IDENTITY, SERIAL, AUTO_INCREMENT) create hotspot anti-patterns in Google Cloud Spanner. Spanner splits data by primary key range, and sequential inserts to a single key range cannot scale horizontally.
Applications migrating to Spanner with sequential keys will experience write throughput limitations that defeat the purpose of using Spanner.
Recommendation: During Spanner migration assessment, identify all tables using sequential integer primary keys. Redesign keys using UUID, hash-based, or bit-reversed integers before migration. Use the Spanner Migration Tool (SMT) schema recommendations to identify affected tables.

<!-- MG-DB-009 | MEDIUM -->
**End-of-life database versions with no managed cloud service path require upgrade pre-migration**
Database versions such as Oracle 9i, SQL Server 2000/2005, Sybase ASE, and MySQL 5.5 have no managed cloud service equivalent and may not be supported as sources by DMS tooling. Migrating these versions as-is to IaaS replicates an existing security and support liability.
Recommendation: Assess database version support status during discovery. For EOL database versions, plan a database upgrade as a pre-migration workstream or include the upgrade as part of the Replatform migration strategy.

---

## Container

<!-- MG-CON-001 | HIGH -->
**Applications with local filesystem persistent state cannot be containerised without remediation**
Containers are ephemeral — any data written to the local container filesystem is lost on restart, scale-out, or rescheduling. Applications writing session state, user files, or operational data to local disk will experience silent data loss in containerised environments.
This is the most commonly discovered container blocker in lift-and-shift containerisation projects.
Recommendation: Identify all local filesystem write operations during container readiness assessment. Externalise persistent state to managed storage: S3/Azure Blob/GCS for files, ElastiCache/Redis for session state, managed database for structured data. Treat as a mandatory pre-containerisation remediation item. Source: GCP containerisation fit assessment; AWS Well-Architected Framework; CNCF Cloud Native Trail Map.

<!-- MG-CON-002 | HIGH -->
**Applications requiring privileged mode containers present critical security risk in shared Kubernetes clusters**
Privileged containers have full access to the host kernel and can escape container isolation, escalating to full node compromise. Kubernetes Pod Security Standards Restricted profile explicitly prohibits privileged containers.
Running privileged containers in shared clusters violates CIS Kubernetes Benchmark and most enterprise security policies.
Recommendation: Investigate why privileged mode is required and refactor using Linux capabilities where possible. If genuinely required, isolate to dedicated nodes with strict access controls. Document as a security risk if deployed. Source: CIS Docker Benchmark; Kubernetes Pod Security Standards; NIST SP 800-190.

<!-- MG-CON-003 | HIGH -->
**Container images must not run as root — required by CIS Docker Benchmark and Kubernetes Pod Security Standards**
Containers running as root (UID 0) expose the host to privilege escalation if a container escape vulnerability is exploited. Many base images (ubuntu, debian, node) default to root unless explicitly overridden — this is the most common container security misconfiguration.
Recommendation: Add a USER instruction to all Dockerfiles specifying a non-root UID (e.g. USER 1001). Scan all images using Trivy, Anchore, or AWS Inspector. Enforce via Kubernetes admission controller (OPA Gatekeeper, Kyverno) or Azure Policy for AKS. Source: CIS Docker Benchmark v1.6; Kubernetes Pod Security Standards; NIST SP 800-190.

<!-- MG-CON-004 | HIGH -->
**Container images must be scanned for vulnerabilities before production deployment**
Unscanned container images are a leading attack vector. Images built on unpatched base images frequently carry critical CVEs that are trivially exploitable. A container image scanning pipeline is a mandatory control for production container workloads.
Recommendation: Integrate image scanning into the CI/CD pipeline using Trivy, AWS ECR Enhanced Scanning, Azure Defender for Container Registries, or GCP Artifact Registry scanning. Block deployment of images with CRITICAL/HIGH severity CVEs without exception approval. Scan base images weekly even if application code has not changed. Source: NIST SP 800-190; CIS Docker Benchmark; AWS/Azure/GCP container security guidance.

<!-- MG-CON-005 | HIGH -->
**Secrets must not be stored in container environment variables or baked into container images**
Environment variables are visible to all container processes and written to orchestration logs. Image layers are permanently inspectable — any secret baked in is permanently exposed in image history. This is a CWE-200 violation and OWASP A02:2021 finding.
Recommendation: Use a secrets manager for all sensitive configuration: AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, or HashiCorp Vault. Inject secrets as mounted volumes via External Secrets Operator or AWS Secrets Store CSI Driver. Scan Dockerfiles and manifests for hardcoded credentials using git-secrets or gitleaks. Source: CIS Docker Benchmark Section 4.6; AWS/Azure/GCP secrets management best practices.

<!-- MG-CON-006 | MEDIUM -->
**Container images must not use 'latest' tag in production — use immutable digest or version-pinned references**
The 'latest' tag is mutable — pulling 'latest' at different times may retrieve different image versions, breaking reproducibility and auditability. Production containers must use immutable image references.
Recommendation: Enforce immutable image tags in the container registry (ECR Immutable Tags, ACR Content Trust, Artifact Registry tag policies). Use digest references (sha256:...) or version-pinned tags in all Kubernetes manifests and ECS task definitions. Fail CI/CD pipelines that deploy 'latest'. Source: Google Cloud Build best practices; CNCF Supply Chain Security White Paper.

<!-- MG-CON-007 | MEDIUM -->
**All containerised workloads must implement liveness and readiness probes in Kubernetes**
Without probes, Kubernetes cannot detect unhealthy containers or remove them from the service endpoint pool. Failed containers without probes will receive traffic until manually detected and hung containers will not restart automatically.
Recommendation: Define livenessProbe and readinessProbe for every container in all Kubernetes manifests. Use HTTP GET probes against /health (liveness) and /ready (readiness) endpoints. Set appropriate initialDelaySeconds and periodSeconds for application startup time. Source: Kubernetes Production Best Practices; AWS EKS Best Practices Guide; Azure AKS baseline architecture.

<!-- MG-CON-008 | MEDIUM -->
**Windows containers carry significant image size, licensing, and operational overhead — require explicit justification**
Windows Server Core base images are ~4 GB vs <20 MB for Linux distroless equivalents. Windows containers require Windows Server licensing for node pools. Windows containers are only warranted for COM/DCOM, .NET Framework, and Windows Registry-dependent applications.
Recommendation: Use Windows containers only where technically required. Migrate .NET Framework applications to .NET (Core/5+) to unlock Linux container support. Document Windows-specific base image choice and licensing cost in the architecture decision record. Source: Microsoft Windows Containers documentation; AWS ECS Windows containers; AKS Windows node pools.

<!-- MG-CON-009 | MEDIUM -->
**Container resource requests and limits must be defined — unbounded containers cause node pressure and evictions**
Kubernetes containers without resource requests and limits can consume unbounded CPU and memory, causing resource starvation for co-located pods. This is the most common cause of Kubernetes node pressure evictions in production.
Recommendation: Define CPU requests and memory requests/limits for every container. Use VPA in recommendation mode to baseline resource requirements from observed usage. Set LimitRange objects in namespaces to enforce defaults. Source: Kubernetes Resource Management documentation; AWS EKS Best Practices; Azure AKS resource management guidance.

<!-- MG-CON-010 | LOW -->
**Container images should use distroless or minimal base images to reduce attack surface and CVE exposure**
Large base images (ubuntu, debian, centos) include package managers, shells, and utilities not required at runtime, expanding the attack surface. Distroless images reduce CVE exposure by 60–90% compared to full OS base images.
Recommendation: Use distroless base images (gcr.io/distroless, cgr.dev/chainguard) or Alpine as the final stage in multi-stage Dockerfile builds. Reserve full OS base images for the build stage only. Source: Google Distroless project; CIS Docker Benchmark Section 4.3; Snyk Container Security Report 2023.

---

## Custom

<!-- Add your organisation-specific guardrails below using the same format -->
<!-- MG-CUS-001 | MEDIUM -->
<!-- Example: All migrated workloads must use the approved tagging taxonomy -->
