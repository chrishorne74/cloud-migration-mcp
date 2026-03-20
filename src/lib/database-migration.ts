import type {
  DatabaseMigrationAssessment,
  DatabaseMigrationPath,
  DatabaseDowntimeModel,
  DatabaseMigrationRisk,
  WorkloadInput,
} from "../types/index.js";

// ─── Engine detection helpers ─────────────────────────────────────────────────

function detectEngine(w: WorkloadInput): string {
  const src = (w.database ?? w.databaseVersion ?? w.technology ?? "").toLowerCase();
  if (/oracle/i.test(src)) return "Oracle";
  if (/sql\s*server|mssql/i.test(src)) return "SQL Server";
  if (/mysql/i.test(src)) return "MySQL";
  if (/postgres|pg\b/i.test(src)) return "PostgreSQL";
  if (/aurora/i.test(src)) return "Aurora";
  if (/mongodb|mongo/i.test(src)) return "MongoDB";
  if (/db2/i.test(src)) return "DB2";
  if (/sybase|ase\b/i.test(src)) return "Sybase";
  if (/mariadb/i.test(src)) return "MariaDB";
  if (/cassandra/i.test(src)) return "Cassandra";
  if (/redis/i.test(src)) return "Redis";
  if (/dynamodb/i.test(src)) return "DynamoDB";
  return "Unknown";
}

// ─── Target recommendation matrix ────────────────────────────────────────────

interface TargetOption {
  path: DatabaseMigrationPath;
  target: string;
  tools: string[];
  schemaConversion: boolean;
  conversionEffort: DatabaseMigrationAssessment["estimatedConversionEffort"];
  weeks: number;
}

function getTargetOptions(engine: string, w: WorkloadInput): TargetOption[] {
  const preferredTarget = (w.targetDatabaseEngine ?? "").toLowerCase();
  const sizeGb = w.databaseSizeGb ?? 0;
  const storedProcs = w.storedProcedureCount ?? 0;
  const hasComplexFeatures = storedProcs > 50 || (w.oracleFeatures?.length ?? 0) > 0 || (w.sqlServerFeatures?.length ?? 0) > 0;

  switch (engine) {
    case "SQL Server":
      return [
        {
          path: "Homogeneous",
          target: "Amazon RDS for SQL Server / Azure SQL Managed Instance / SQL Server on GCE",
          tools: ["AWS DMS", "Azure Database Migration Service", "SSMS Backup/Restore", "SQL Server Distributed Replay"],
          schemaConversion: false,
          conversionEffort: "Low",
          weeks: sizeGb > 1000 ? 6 : 3,
        },
        {
          path: "Heterogeneous",
          target: "Amazon Aurora PostgreSQL / Azure Database for PostgreSQL / Cloud SQL for PostgreSQL",
          tools: ["AWS Schema Conversion Tool (SCT)", "AWS DMS", "Azure Database Migration Service", "pgloader"],
          schemaConversion: true,
          conversionEffort: hasComplexFeatures ? "High" : "Medium",
          weeks: sizeGb > 500 ? 16 : 10,
        },
      ];

    case "Oracle":
      return [
        {
          path: "Homogeneous",
          target: "Amazon RDS for Oracle / Oracle on GCE / Oracle on Azure VM",
          tools: ["AWS DMS", "Oracle Data Pump", "RMAN", "GoldenGate"],
          schemaConversion: false,
          conversionEffort: "Low",
          weeks: sizeGb > 1000 ? 8 : 4,
        },
        {
          path: "Heterogeneous",
          target: "Amazon Aurora PostgreSQL / Azure Database for PostgreSQL / AlloyDB",
          tools: ["AWS Schema Conversion Tool (SCT)", "AWS DMS", "Ora2Pg", "GCP DMS", "pgloader"],
          schemaConversion: true,
          conversionEffort: hasComplexFeatures ? "Very High" : "High",
          weeks: sizeGb > 500 ? 24 : 16,
        },
      ];

    case "MySQL":
    case "MariaDB":
      return [
        {
          path: "Homogeneous",
          target: "Amazon Aurora MySQL / Amazon RDS for MySQL / Azure Database for MySQL / Cloud SQL for MySQL",
          tools: ["AWS DMS", "mysqldump", "MySQL Shell", "mydumper/myloader", "Azure Database Migration Service"],
          schemaConversion: false,
          conversionEffort: "Low",
          weeks: sizeGb > 500 ? 4 : 2,
        },
      ];

    case "PostgreSQL":
      return [
        {
          path: "Homogeneous",
          target: "Amazon Aurora PostgreSQL / Amazon RDS for PostgreSQL / Azure Database for PostgreSQL / Cloud SQL for PostgreSQL / AlloyDB",
          tools: ["AWS DMS", "pg_dump/pg_restore", "pgcopydb", "Azure Database Migration Service", "GCP DMS"],
          schemaConversion: false,
          conversionEffort: "Low",
          weeks: sizeGb > 500 ? 4 : 2,
        },
      ];

    case "MongoDB":
      return [
        {
          path: "Near-Homogeneous",
          target: "Amazon DocumentDB (MongoDB 5.0-compatible) / Azure Cosmos DB for MongoDB / MongoDB Atlas on cloud",
          tools: ["mongodump/mongorestore", "AWS DMS", "mongomirror", "Compass Export"],
          schemaConversion: false,
          conversionEffort: "Medium",
          weeks: 4,
        },
      ];

    case "DB2":
      return [
        {
          path: "Heterogeneous",
          target: "Amazon RDS for PostgreSQL / Azure Database for PostgreSQL / Cloud SQL for PostgreSQL",
          tools: ["AWS Schema Conversion Tool (SCT)", "AWS DMS", "db2look + db2move", "IBM Lift CLI"],
          schemaConversion: true,
          conversionEffort: hasComplexFeatures ? "Very High" : "High",
          weeks: sizeGb > 500 ? 20 : 14,
        },
      ];

    case "Sybase":
      return [
        {
          path: "Heterogeneous",
          target: "Amazon RDS for SQL Server / Azure SQL Managed Instance",
          tools: ["AWS Schema Conversion Tool (SCT)", "AWS DMS", "SAP Replication Server", "bcp utility"],
          schemaConversion: true,
          conversionEffort: "High",
          weeks: 14,
        },
      ];

    case "Cassandra":
      return [
        {
          path: "Near-Homogeneous",
          target: "Amazon Keyspaces (Cassandra-compatible) / Azure Cosmos DB for Cassandra / Astra DB (DataStax)",
          tools: ["cqlsh COPY", "dsbulk", "Cassandra Migrator", "AWS DMS (limited support)"],
          schemaConversion: false,
          conversionEffort: "Medium",
          weeks: 6,
        },
      ];

    default:
      return [
        {
          path: "Heterogeneous",
          target: "Requires manual assessment — no standard automated path for this engine",
          tools: ["Manual ETL", "AWS DMS (if supported)", "Custom scripts"],
          schemaConversion: true,
          conversionEffort: "High",
          weeks: 12,
        },
      ];
  }
}

// ─── Downtime model selection ─────────────────────────────────────────────────

function selectDowntimeModel(w: WorkloadInput, path: DatabaseMigrationPath, engine: string): DatabaseDowntimeModel {
  if (w.databaseDowntimeTolerance === "zero" || w.requiresContinuousReplication === true) {
    return "CDC Replication — Near-Zero Downtime";
  }
  if (w.databaseDowntimeTolerance === "minutes") {
    return "Online Migration with Cutover Window";
  }
  if (path === "Homogeneous" && (w.databaseSizeGb ?? 0) < 100) {
    return "Snapshot + Bulk Load";
  }
  if (engine === "SQL Server" && path === "Homogeneous") {
    return "Online Migration with Cutover Window";
  }
  return "CDC Replication — Near-Zero Downtime";
}

// ─── Risk identification ──────────────────────────────────────────────────────

function identifyRisks(w: WorkloadInput, engine: string, option: TargetOption): DatabaseMigrationRisk[] {
  const risks: DatabaseMigrationRisk[] = [];

  if (w.sqlServerFeatures?.includes("FILESTREAM") || w.sqlServerFeatures?.includes("FileTable")) {
    risks.push({
      id: "DB-RISK-001",
      severity: "CRITICAL",
      description: "SQL Server FILESTREAM/FileTable cannot be restored to Azure SQL Managed Instance or RDS.",
      mitigation: "Migrate FILESTREAM data to blob storage (S3/Blob) and update application references before migration.",
    });
  }

  if (w.oracleFeatures?.includes("ANYDATA")) {
    risks.push({
      id: "DB-RISK-002",
      severity: "CRITICAL",
      description: "Oracle ANYDATA type is unsupported by GCP DMS and AWS DMS — affected tables cannot be replicated.",
      mitigation: "Migrate ANYDATA tables via Oracle Data Pump bulk export/import with a planned downtime window.",
    });
  }

  if (w.oracleFeatures?.includes("IndexOrganisedTables") || w.oracleFeatures?.includes("IOT")) {
    risks.push({
      id: "DB-RISK-003",
      severity: "CRITICAL",
      description: "Oracle Index-Organised Tables (IOTs) are not supported by GCP DMS.",
      mitigation: "Plan bulk export for IOT tables outside the DMS replication stream. Convert to heap tables in target.",
    });
  }

  if (w.hasTablesWithoutPrimaryKeys === true) {
    risks.push({
      id: "DB-RISK-004",
      severity: "HIGH",
      description: "Tables without primary keys — DMS CDC replication cannot guarantee row-level consistency.",
      mitigation: "Add primary keys or configure supplemental logging before starting DMS. Validate row counts post-migration.",
    });
  }

  if (w.sqlServerFeatures?.includes("xp_cmdshell") || w.sqlServerFeatures?.includes("LinkedServers")) {
    risks.push({
      id: "DB-RISK-005",
      severity: "HIGH",
      description: "xp_cmdshell / Linked Servers require explicit enablement on managed targets and may not be supported.",
      mitigation: "Refactor xp_cmdshell calls to SQL Agent jobs or Lambda/Azure Functions. Replace Linked Servers with ETL pipelines or federated queries.",
    });
  }

  if ((w.storedProcedureCount ?? 0) > 100 && option.path === "Heterogeneous") {
    risks.push({
      id: "DB-RISK-006",
      severity: "HIGH",
      description: `High stored procedure count (${w.storedProcedureCount}) in heterogeneous migration — T-SQL/PL-SQL to PL/pgSQL conversion is labour-intensive.`,
      mitigation: "Use AWS SCT or Ora2Pg for automated conversion. Budget for manual review of all converted procedures. Test every stored procedure in target before cutover.",
    });
  }

  if ((w.databaseSizeGb ?? 0) > 1000) {
    risks.push({
      id: "DB-RISK-007",
      severity: "HIGH",
      description: `Large dataset (${w.databaseSizeGb} GB) — initial load time may exceed DMS task timeout or migration window.`,
      mitigation: "Use parallel DMS tasks, AWS Snowball Edge for offline transfer, or Azure Data Box for initial bulk load. Then switch to CDC for incremental sync.",
    });
  }

  if (w.requiresContinuousReplication && engine === "Oracle" && w.oracleFeatures?.includes("XmlDb")) {
    risks.push({
      id: "DB-RISK-008",
      severity: "MEDIUM",
      description: "Oracle XML DB features may not replicate correctly via DMS CDC.",
      mitigation: "Test Oracle XML DB replication in DMS lab environment. Consider bulk export for XML-heavy tables.",
    });
  }

  return risks;
}

// ─── Checklists ───────────────────────────────────────────────────────────────

function buildPreChecklist(engine: string, option: TargetOption, w: WorkloadInput): string[] {
  const items = [
    `Run ${engine === "Oracle" ? "Oracle AWR/Statspack" : engine === "SQL Server" ? "SQL Server Assessment (DMA)" : "database profiling"} to baseline performance metrics`,
    "Inventory all schemas, tables, stored procedures, triggers, views, and functions",
    "Identify and document all upstream/downstream application connections",
    "Confirm database downtime tolerance with application owner and business stakeholders",
    "Provision and validate target database instance in cloud environment",
    `Install and configure ${option.tools[0]} for migration`,
    "Perform a full test migration to a non-production target environment",
    "Validate row counts and checksums on all tables post-test-migration",
    "Test all application functions against migrated non-production database",
    "Confirm backup and recovery procedures in target environment",
    "Agree rollback criteria and rehearse rollback procedure",
  ];

  if (option.schemaConversion) {
    items.splice(2, 0, `Run AWS Schema Conversion Tool (SCT) or equivalent to generate conversion report — review and remediate all action items`);
  }

  if (w.hasTablesWithoutPrimaryKeys) {
    items.push("Add primary keys to all tables lacking them, or configure supplemental logging in source database");
  }

  return items;
}

function buildPostChecklist(engine: string): string[] {
  return [
    "Validate row counts match source for all tables",
    "Run application smoke tests against migrated database",
    "Validate all stored procedures, triggers, and views execute without error",
    "Confirm all application connection strings updated to point to new endpoint",
    "Verify backup jobs are running and producing valid backups",
    "Confirm monitoring and alerting configured (CloudWatch, Azure Monitor, Cloud Monitoring)",
    "Remove or disable DMS replication task after successful cutover",
    "Revoke or rotate source database credentials no longer required",
    "Update CMDB / asset inventory with new database endpoint",
    "Decommission source database after hypercare period (minimum 2 weeks)",
  ];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function assessDatabaseMigration(workload: WorkloadInput): DatabaseMigrationAssessment {
  const engine = detectEngine(workload);
  const options = getTargetOptions(engine, workload);
  const option = options[0]; // primary recommendation

  const downtimeModel = selectDowntimeModel(workload, option.path, engine);
  const risks = identifyRisks(workload, engine, option);

  return {
    databaseName: workload.name,
    sourceEngine: engine,
    migrationPath: option.path,
    recommendedTarget: option.target,
    migrationTools: option.tools,
    schemaConversionRequired: option.schemaConversion,
    estimatedConversionEffort: option.conversionEffort,
    downtimeModel,
    estimatedMigrationWeeks: option.weeks,
    risks,
    preChecklist: buildPreChecklist(engine, option, workload),
    postChecklist: buildPostChecklist(engine),
  };
}
