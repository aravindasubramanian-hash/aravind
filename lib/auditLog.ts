import { DecisionRecord } from "./types";

// Persistent audit log backed by Upstash Redis (REST API, no SDK dependency).
// Every decision the guardrail evaluates is pushed onto a Redis list, newest
// first, so the dashboard's history survives Vercel's serverless cold starts
// — a plain in-memory array does not, since it resets whenever a fresh
// function instance spins up.
//
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to be set as
// environment variables (Vercel: Project Settings -> Environment Variables).
// If they are not set (e.g. local dev without Upstash configured), this
// falls back to an in-memory array so nothing breaks.

const MAX_RECORDS = 200;
const KEY = "ops-decision-guardrail:audit-log";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let memoryFallback: DecisionRecord[] = [];

function redisConfigured(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function redisCommand(...args: (string | number)[]): Promise<unknown> {
  const path = args.map((a) => encodeURIComponent(String(a))).join("/");
  const res = await fetch(`${REDIS_URL}/${path}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Upstash Redis command failed: ${res.status}`);
  }
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

export async function record(entry: DecisionRecord): Promise<void> {
  if (!redisConfigured()) {
    memoryFallback = [entry, ...memoryFallback].slice(0, MAX_RECORDS);
    return;
  }
  await redisCommand("LPUSH", KEY, JSON.stringify(entry));
  await redisCommand("LTRIM", KEY, 0, MAX_RECORDS - 1);
}

export async function list(): Promise<DecisionRecord[]> {
  if (!redisConfigured()) {
    return memoryFallback;
  }
  const raw = (await redisCommand("LRANGE", KEY, 0, MAX_RECORDS - 1)) as string[];
  return raw.map((r) => JSON.parse(r) as DecisionRecord);
}
