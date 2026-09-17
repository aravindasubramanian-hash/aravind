import { DecisionRecord } from "./types";

// In-memory audit log for the demo. Every decision the guardrail evaluates
// is appended here, newest first, so the dashboard can show a scrollable
// history. A real deployment would persist this (Postgres, SQLite, an
// append-only log) — swapping the storage is the only change needed since
// callers only ever see `record` / `list`.

const MAX_RECORDS = 200;
let records: DecisionRecord[] = [];

export function record(entry: DecisionRecord): void {
  records = [entry, ...records].slice(0, MAX_RECORDS);
}

export function list(): DecisionRecord[] {
  return records;
}
