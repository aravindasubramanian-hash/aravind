// Shared types for the Ops Decision Guardrail.
// The Decision Agent produces a Proposal; the Guardrail turns it into a
// Verdict by checking each claim against Moss-retrieved policy facts.

export type ScenarioId =
  | "correct"
  | "price_mismatch"
  | "moq_violation"
  | "unapproved_vendor"
  | "budget_overrun"
  | "unverifiable_vendor";

export interface Scenario {
  id: ScenarioId;
  label: string;
  query: string;
}

/** A single fact stored in (or mirrored from) the Moss index. */
export interface PolicyFact {
  id: string;
  text: string;
  metadata: {
    component: string;
    vendor?: string;
    field: string;
    value: number | string | boolean;
    unit?: string;
  };
}

/** A structured decision proposed by the Decision Agent. */
export interface Proposal {
  component: string;
  vendor: string;
  quantity: number;
  unitPrice: number;
  leadTimeDays: number;
  totalCost: number;
  rationale: string;
}

export type ClaimStatus = "grounded" | "flagged" | "unverifiable";
export type ClaimSeverity = "info" | "warning" | "critical";

export interface Claim {
  field: string;
  label: string;
  claimedValue: number | string;
  unit?: string;
}

export interface ClaimResult extends Claim {
  status: ClaimStatus;
  severity: ClaimSeverity;
  retrievedValue?: number | string | boolean;
  retrievedText?: string;
  citationId?: string;
  latencyMs: number;
  detail: string;
}

export type Verdict = "PASS" | "FLAG" | "BLOCK";

export interface GuardrailResult {
  verdict: Verdict;
  confidence: number; // 0..1
  claims: ClaimResult[];
  totalLatencyMs: number;
  mossOnlyLatencyMs: number;
}

export interface DecisionRecord {
  id: string;
  timestamp: string;
  query: string;
  scenario: ScenarioId;
  proposal: Proposal;
  guardrail: GuardrailResult;
  agentLatencyMs: number;
}
