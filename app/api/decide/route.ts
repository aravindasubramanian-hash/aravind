import { NextRequest, NextResponse } from "next/server";
import { proposeDecision } from "@/lib/agent";
import { evaluateProposal } from "@/lib/guardrail";
import { record, list } from "@/lib/auditLog";
import { DecisionRecord, ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/agent";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ records: list() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const scenario = body.scenario as ScenarioId | undefined;

  if (!scenario || !SCENARIOS.some((s) => s.id === scenario)) {
    return NextResponse.json({ error: "Unknown or missing `scenario`." }, { status: 400 });
  }

  const query = SCENARIOS.find((s) => s.id === scenario)!.query;
  const { proposal, latencyMs: agentLatencyMs } = await proposeDecision(scenario);
  const guardrail = await evaluateProposal(proposal);

  const entry: DecisionRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    query,
    scenario,
    proposal,
    guardrail,
    agentLatencyMs,
  };
  record(entry);

  return NextResponse.json(entry);
}
