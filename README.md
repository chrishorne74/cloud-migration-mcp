# Cloud Migration MCP Server

An MCP (Model Context Protocol) server that provides cloud migration assessment, strategy recommendation, guardrail enforcement, candidate scoring, wave planning, cost estimation, and draw.io architecture diagram generation.

## Features

- **7 Rs Strategy Engine** — Recommends one of the 7 cloud migration strategies (Rehost, Replatform, Repurchase, Refactor, Retire, Retain, Relocate) based on workload attributes
- **Migration Assessment** — Scores workloads 0–100 across 10 industry-standard criteria (business criticality, complexity, vendor support, cloud readiness, cost, age, SaaS availability, data sensitivity, documentation, compliance)
- **Migration Guardrails** — 30+ built-in guardrails across Dependency, Security, Compliance, Data, Architecture, Operations, and Cost categories — fully editable
- **Candidate Scoring & Ranking** — Rank up to 50 workloads by migration readiness in one call
- **Wave Planning** — Groups workloads into sequenced migration waves respecting dependencies and affinity groups
- **Cost Estimation** — ROM (±50%) cost estimates with cloud annual cost, one-time migration cost, 1/3-year savings, and ROI break-even
- **Draw.io Diagrams** — Generates migration architecture diagrams using native draw.io AWS, Azure, and GCP shapes — pass the XML to the draw.io MCP `open_drawio_xml` tool
- **Extensible Rules** — Add, update, or delete guardrails and scoring criteria at runtime via MCP tools

## Tools

| Tool | Description |
|---|---|
| `list_migration_guardrails` | List all migration guardrails by category/severity |
| `add_migration_guardrail` | Add an organisation-specific guardrail |
| `update_migration_guardrail` | Update a guardrail's severity or text |
| `delete_migration_guardrail` | Delete a guardrail by ID |
| `reload_migration_guardrails` | Reload guardrails after manual file edits |
| `assess_workload` | Full assessment: score, readiness, 7R recommendation, guardrail violations |
| `score_migration_candidates` | Score and rank multiple workloads |
| `check_migration_guardrails` | Automated guardrail check for a workload |
| `list_migration_criteria` | List scoring criteria with weights |
| `add_migration_criterion` | Add a custom scoring criterion |
| `update_migration_criterion` | Update weight or direction of a criterion |
| `list_migration_strategies` | Describe all 7 Rs with indicators and exclusions |
| `recommend_migration_strategy` | Quick 7R recommendation for a workload |
| `estimate_migration_cost` | ROM cost estimate with breakdown |
| `create_migration_wave_plan` | Group workloads into migration waves |
| `generate_migration_diagram` | Generate draw.io XML with native cloud shapes |
| `generate_assessment_diagram` | Assess + generate draw.io diagram in one step |

## Guardrails

Built-in guardrails cover:
- **Dependency** — Keep app and DB tiers together; migrate tightly coupled services together; resolve circular dependencies; shared infra migrates first
- **Security** — Cloud security baseline before first workload; encryption in transit/at rest; no plain-text secrets; least-privilege IAM; vulnerability assessment
- **Compliance** — Data residency; PCI-DSS QSA review; HIPAA BAA; audit logging; licence compliance
- **Data** — Data integrity validation; production data masking; backup/recovery testing; large dataset handling
- **Architecture** — Landing zone compliance; SPOF remediation; stateful storage; legacy OS upgrades; observability
- **Operations** — Rollback plan; cutover windows; hypercare period; runbook review; DNS cutover
- **Cost** — Cost baseline; right-sizing; reserved capacity; decommission plan

Add your own guardrails using `add_migration_guardrail` or by editing `guardrails/migration-guardrails.md`.

## Scoring Criteria

10 weighted criteria out of the box:
1. Business Criticality (weight 8)
2. Technical Complexity (weight 9)
3. Vendor Support Status (weight 7)
4. Cloud Readiness / Source Code (weight 9)
5. Current Infrastructure Cost (weight 7)
6. Application Age (weight 5)
7. SaaS Alternative Availability (weight 6)
8. Data Sensitivity (weight 6)
9. Documentation Quality (weight 5)
10. Compliance Overhead (weight 7)

Add or modify criteria using `add_migration_criterion` / `update_migration_criterion` or by editing `criteria/migration-criteria.json`.

## Installation

### Claude Desktop

```json
{
  "mcpServers": {
    "cloud-migration": {
      "command": "node",
      "args": ["C:\\Users\\chris\\cloud-migration-mcp\\build\\index.js"],
      "env": {
        "GUARDRAILS_FILE": "C:\\Users\\chris\\cloud-migration-mcp\\guardrails\\migration-guardrails.md",
        "CRITERIA_FILE": "C:\\Users\\chris\\cloud-migration-mcp\\criteria\\migration-criteria.json"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/chrishorne74/cloud-migration-mcp.git
cd cloud-migration-mcp
npm install
npm run build
```

## Custom Guardrails & Criteria

### Guardrails file (`guardrails/migration-guardrails.md`)

Add a new guardrail block under `## Custom`:

```markdown
<!-- MG-CUS-001 | HIGH -->
**All migrated workloads must use the approved tagging taxonomy**
Every cloud resource created during migration must include the approved tags (cost-centre, environment, owner, project).
Untagged resources cannot be allocated to cost centres and violate governance policy.
Recommendation: Include tagging validation in the migration runbook. Reject pull requests for IaC that omit required tags.
```

Run `reload_migration_guardrails` to apply without restarting the server.

### Criteria file (`criteria/migration-criteria.json`)

Add a JSON object to the `criteria` array and call `reload_migration_criteria` (or restart the server).

## Building the .mcpb package

```bash
npm run build:mcpb
# Output: dist/cloud-migration.mcpb
```

## Integration with draw.io MCP

The diagram tools return draw.io XML. Pass it directly to the draw.io MCP server:

```
1. Call generate_migration_diagram or generate_assessment_diagram
2. Copy the XML from the response
3. Call open_drawio_xml with the XML
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `GUARDRAILS_FILE` | Path to built-in guardrails file | `./guardrails/migration-guardrails.md` |
| `CRITERIA_FILE` | Path to built-in criteria file | `./criteria/migration-criteria.json` |
| `USER_GUARDRAILS_FILE` | Path to custom guardrails (overrides built-in) | — |
| `USER_CRITERIA_FILE` | Path to custom criteria (overrides built-in) | — |
