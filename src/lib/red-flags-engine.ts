import fs from "fs";
import path from "path";
import type { WorkloadInput } from "../types/index.js";
import type { RedFlag, RedFlagSeverity } from "./red-flags.js";

// ─── Condition expression types ───────────────────────────────────────────────

type SimpleOperator =
  | "eq" | "neq"
  | "lt" | "lte" | "gt" | "gte"
  | "includes" | "notIncludes"
  | "defined" | "undefined"
  | "includesMatch";

interface SimpleCondition {
  attribute: string;
  operator: SimpleOperator;
  value?: unknown;
}

interface AndCondition {
  and: RedFlagCondition[];
}

interface OrCondition {
  or: RedFlagCondition[];
}

type RedFlagCondition = SimpleCondition | AndCondition | OrCondition;

// ─── Red flag definition ──────────────────────────────────────────────────────

export interface RedFlagDefinition {
  id: string;
  severity: RedFlagSeverity;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  source: string;
  condition: RedFlagCondition;
}

interface RedFlagDocument {
  version: string;
  description: string;
  redFlags: RedFlagDefinition[];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cachedDoc: RedFlagDocument | null = null;
let cachedPath: string | null = null;

export function invalidateRedFlagsCache(): void {
  cachedDoc = null;
  cachedPath = null;
}

function getRedFlagsFilePath(): string {
  return (
    process.env["RED_FLAGS_FILE"] ||
    process.env["USER_RED_FLAGS_FILE"] ||
    path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../red-flags/migration-red-flags.json")
  );
}

function loadRedFlagsDocument(filePath: string): RedFlagDocument {
  if (cachedDoc && cachedPath === filePath) {
    return cachedDoc;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedDoc = JSON.parse(raw) as RedFlagDocument;
  cachedPath = filePath;
  return cachedDoc;
}

export function getRedFlagsDocument(): RedFlagDocument {
  return loadRedFlagsDocument(getRedFlagsFilePath());
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function getAttr(workload: WorkloadInput, attribute: string): unknown {
  return (workload as unknown as Record<string, unknown>)[attribute];
}

function evaluateCondition(condition: RedFlagCondition, workload: WorkloadInput): boolean {
  // Compound: and
  if ("and" in condition) {
    return condition.and.every(c => evaluateCondition(c, workload));
  }

  // Compound: or
  if ("or" in condition) {
    return condition.or.some(c => evaluateCondition(c, workload));
  }

  // Simple
  const { attribute, operator, value } = condition as SimpleCondition;
  const attr = getAttr(workload, attribute);

  switch (operator) {
    case "eq":       return attr === value;
    case "neq":      return attr !== value;
    case "lt":       return typeof attr === "number" && attr < (value as number);
    case "lte":      return typeof attr === "number" && attr <= (value as number);
    case "gt":       return typeof attr === "number" && attr > (value as number);
    case "gte":      return typeof attr === "number" && attr >= (value as number);
    case "defined":  return attr !== undefined && attr !== null;
    case "undefined": return attr === undefined || attr === null;
    case "includes":
      return Array.isArray(attr) && attr.includes(value);
    case "notIncludes":
      return !Array.isArray(attr) || !attr.includes(value);
    case "includesMatch":
      // attr is an array of strings; value is a regex string pattern
      return Array.isArray(attr) && attr.some(item =>
        typeof item === "string" && new RegExp(value as string, "i").test(item)
      );
    default:
      return false;
  }
}

// ─── Main evaluation function ─────────────────────────────────────────────────

export function evaluateRedFlagsFromDocument(
  workload: WorkloadInput,
  doc: RedFlagDocument
): RedFlag[] {
  const results: RedFlag[] = [];
  for (const def of doc.redFlags) {
    try {
      if (evaluateCondition(def.condition, workload)) {
        results.push({
          id: def.id,
          severity: def.severity,
          category: def.category,
          title: def.title,
          detail: def.detail,
          recommendation: def.recommendation,
          source: def.source,
        });
      }
    } catch {
      // Malformed condition — skip silently
    }
  }
  return results;
}

export function evaluateRedFlags(workload: WorkloadInput): RedFlag[] {
  const doc = getRedFlagsDocument();
  return evaluateRedFlagsFromDocument(workload, doc);
}

// ─── CRUD helpers ─────────────────────────────────────────────────────────────

export function listRedFlagDefinitions(): { definitions: RedFlagDefinition[]; filePath: string; count: number } {
  const filePath = getRedFlagsFilePath();
  const doc = loadRedFlagsDocument(filePath);
  return { definitions: doc.redFlags, filePath, count: doc.redFlags.length };
}

export function addRedFlagToFile(definition: RedFlagDefinition): { added: RedFlagDefinition; filePath: string } {
  const filePath = getRedFlagsFilePath();
  const doc = loadRedFlagsDocument(filePath);

  if (doc.redFlags.some(d => d.id === definition.id)) {
    throw new Error(`Red flag with ID "${definition.id}" already exists. Use update_red_flag to modify it.`);
  }

  doc.redFlags.push(definition);
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf-8");
  invalidateRedFlagsCache();

  return { added: definition, filePath };
}

export function updateRedFlagInFile(
  id: string,
  updates: Partial<Omit<RedFlagDefinition, "id">>
): { updated: RedFlagDefinition; filePath: string } {
  const filePath = getRedFlagsFilePath();
  const doc = loadRedFlagsDocument(filePath);

  const idx = doc.redFlags.findIndex(d => d.id === id);
  if (idx === -1) {
    throw new Error(`Red flag with ID "${id}" not found.`);
  }

  doc.redFlags[idx] = { ...doc.redFlags[idx], ...updates } as RedFlagDefinition;
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf-8");
  invalidateRedFlagsCache();

  return { updated: doc.redFlags[idx], filePath };
}

export function deleteRedFlagFromFile(id: string): { deleted: string; filePath: string } {
  const filePath = getRedFlagsFilePath();
  const doc = loadRedFlagsDocument(filePath);

  const idx = doc.redFlags.findIndex(d => d.id === id);
  if (idx === -1) {
    throw new Error(`Red flag with ID "${id}" not found.`);
  }

  doc.redFlags.splice(idx, 1);
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf-8");
  invalidateRedFlagsCache();

  return { deleted: id, filePath };
}

export function reloadRedFlags(): { loaded: number; filePath: string } {
  invalidateRedFlagsCache();
  const filePath = getRedFlagsFilePath();
  const doc = loadRedFlagsDocument(filePath);
  return { loaded: doc.redFlags.length, filePath };
}
