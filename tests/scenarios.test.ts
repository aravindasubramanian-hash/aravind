import { describe, expect, it } from "vitest";
import { SCENARIOS, proposeDecision } from "../lib/agent";
import { evaluateProposal } from "../lib/guardrail";
import type { ScenarioId, Verdict } from "../lib/types";

// This is the evaluation the project's whole premise rests on: for each of
// the six scripted scenarios (some deliberately wrong, on purpose — see
// lib/agent.ts), the guardrail must independently reach the documented
// verdict. If one of these fails, the demo's PASS/FLAG/BLOCK table in the
// README is no longer true.

const EXPECTED_VERDICTS: Record<ScenarioId, Verdict> = {
  correct: "PASS",
  price_mismatch: "FLAG",
  moq_violation: "FLAG",
  unapproved_vendor: "BLOCK",
  budget_overrun: "BLOCK",
  unverifiable_vendor: "FLAG",
};

describe("guardrail catches every injected scenario", () => {
  it("covers all six scenarios defined in lib/agent.ts", () => {
    expect(SCENARIOS.map((s) => s.id).sort()).toEqual(Object.keys(EXPECTED_VERDICTS).sort());
  });

  for (const scenario of SCENARIOS) {
    const expected = EXPECTED_VERDICTS[scenario.id];

    it(`"${scenario.id}" resolves to ${expected}`, async () => {
      const { proposal } = await proposeDecision(scenario.id);
      const result = await evaluateProposal(proposal);
      expect(result.verdict).toBe(expected);
    });
  }

  it("BLOCK scenarios always carry a claim at critical severity", async () => {
    for (const id of ["unapproved_vendor", "budget_overrun"] as ScenarioId[]) {
      const { proposal } = await proposeDecision(id);
      const result = await evaluateProposal(proposal);
      expect(result.claims.some((c) => c.status === "flagged" && c.severity === "critical")).toBe(true);
    }
  });

  it("FLAG-by-unverifiable scenarios never contain a critical claim", async () => {
    const { proposal } = await proposeDecision("unverifiable_vendor");
    const result = await evaluateProposal(proposal);
    expect(result.claims.some((c) => c.severity === "critical")).toBe(false);
    expect(result.claims.some((c) => c.status === "unverifiable")).toBe(true);
  });

  it("every claim reports a latency figure, matching the in-process latency story", async () => {
    const { proposal } = await proposeDecision("correct");
    const result = await evaluateProposal(proposal);
    for (const claim of result.claims) {
      expect(typeof claim.latencyMs).toBe("number");
      expect(claim.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.mossOnlyLatencyMs).toBeLessThan(result.totalLatencyMs + 1);
  });
});
