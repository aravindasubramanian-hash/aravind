import { NextRequest, NextResponse } from "next/server";
import { proposeDecision } from "@/lib/agent";
import { evaluateProposal } from "@/lib/guardrail";
import { record, list } from "@/lib/auditLog";
import { DecisionRecord, Proposal, ScenarioId } from "@/lib/types";
import { SCENARIOS } from "@/lib/agent";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ records: list() });
}

const PROPOSAL_FIELDS: (keyof Proposal)[] = [
  "component",
  "vendor",
  "quantity",
  "unitPrice",
  "leadTimeDays",
  "totalCost",
  "rationale",
];

function isValidProposal(p: unknown): p is Proposal {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return PROPOSAL_FIELDS.every((f) => obj[f] !== undefined && obj[f] !== null && obj[f] !== "");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Two ways to reach the guardrail: replay one of the six scripted demo
  // scenarios (agent proposes, guardrail checks), or hand it an arbitrary
  // proposal directly — skipping the agent step entirely — so anyone can
  // construct their own test case (a vendor/component combo, a price, an
  // MOQ, a lead time, a total cost) and see how every claim resolves against
  // the real policy corpus. This is the "validate the guardrail yourself"
  // path: the six buttons are fixed demo fixtures, this is not.
  if (body.customProposal !== undefined) {
    if (!isValidProposal(body.customProposal)) {
      return NextResponse.json(
        {
          error:
            "`customProposal` must include component, vendor, quantity, unitPrice, leadTimeDays, totalCost, and rationale.",
        },
        { status: 400 }
      );
    }
    const proposal = body.customProposal as Proposal;
    const query =
      typeof body.customQuery === "string" && body.customQuery.trim()
        ? body.customQuery.trim()
        : `Custom check — ${proposal.vendor} / ${proposal.component}`;

    const start = performance.now();
    const guardrail = await evaluateProposal(proposal);
    const agentLatencyMs = performance.now() - start; // no agent hop for a custom proposal

    const entry: DecisionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      query,
      scenario: "custom",
      proposal,
      guardrail,
      agentLatencyMs,
    };
    record(entry);
    return NextResponse.json(entry);
  }

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

