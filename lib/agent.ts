import { Proposal, Scenario, ScenarioId } from "./types";

// The Decision Agent proposes an ops decision. Two modes:
//  - "scripted" (default): deterministic, reproducible proposals per scenario,
//    some of them deliberately wrong, so the guardrail's catches are visible
//    on demand and the demo never depends on an LLM being available.
//  - "llm": calls a real model to generate the proposal from free text. Off
//    by default; see README for how to turn it on.

export const SCENARIOS: Scenario[] = [
  {
    id: "correct",
    label: "Correct reorder (should PASS)",
    query: "We're low on Component X — should we reorder from Vendor A, and how much?",
  },
  {
    id: "price_mismatch",
    label: "Price mismatch (should FLAG)",
    query: "Reorder Component X from Vendor A — confirm the price and quantity.",
  },
  {
    id: "moq_violation",
    label: "Below minimum order quantity (should FLAG)",
    query: "We only need a small top-up of Component X — order a small batch from Vendor B.",
  },
  {
    id: "unapproved_vendor",
    label: "Unapproved vendor for this component (should BLOCK)",
    query: "Vendor C offered a good deal — reorder Component X from them.",
  },
  {
    id: "budget_overrun",
    label: "Exceeds purchase-order budget cap (should BLOCK)",
    query: "Place a large reorder of Component X from Vendor A to build up a buffer.",
  },
  {
    id: "unverifiable_vendor",
    label: "Vendor not in policy index (should FLAG — unverifiable)",
    query: "A new supplier, Vendor D, is offering Component X — reorder from them.",
  },
];

const SCRIPTED_PROPOSALS: Record<ScenarioId, Proposal> = {
  correct: {
    component: "Component X",
    vendor: "Vendor A",
    quantity: 6000,
    unitPrice: 211.5,
    leadTimeDays: 15,
    totalCost: 6000 * 211.5,
    rationale:
      "On-hand inventory is below the 1,200-unit safety stock threshold. Vendor A is approved for Component X; ordering at their minimum order quantity keeps unit cost at contract price.",
  },
  price_mismatch: {
    component: "Component X",
    vendor: "Vendor A",
    quantity: 6000,
    unitPrice: 189, // contract price is ₹211.50 — this is wrong
    leadTimeDays: 15,
    totalCost: 6000 * 189,
    rationale: "Reordering from Vendor A at their standard unit price.",
  },
  moq_violation: {
    component: "Component X",
    vendor: "Vendor B",
    quantity: 1500, // Vendor B's MOQ is 3,000 — this is below it
    unitPrice: 234,
    leadTimeDays: 9,
    totalCost: 1500 * 234,
    rationale: "A small top-up order from Vendor B to cover the shortfall.",
  },
  unapproved_vendor: {
    component: "Component X",
    vendor: "Vendor C", // Vendor C is only approved for Component Y
    quantity: 5000,
    unitPrice: 198,
    leadTimeDays: 12,
    totalCost: 5000 * 198,
    rationale: "Vendor C quoted a competitive rate for Component X.",
  },
  budget_overrun: {
    component: "Component X",
    vendor: "Vendor A",
    quantity: 9000,
    unitPrice: 211.5,
    leadTimeDays: 15,
    totalCost: 9000 * 211.5, // ₹19,03,500 — over the ₹18,00,000 PO cap
    rationale: "Ordering extra volume from Vendor A to build a buffer against future shortages.",
  },
  unverifiable_vendor: {
    component: "Component X",
    vendor: "Vendor D", // not in the policy index at all
    quantity: 5000,
    unitPrice: 180,
    leadTimeDays: 10,
    totalCost: 5000 * 180,
    rationale: "Vendor D is a new supplier offering a lower rate for Component X.",
  },
};

export interface AgentResult {
  proposal: Proposal;
  latencyMs: number;
  mode: "scripted" | "llm";
}

export async function proposeDecision(scenario: ScenarioId): Promise<AgentResult> {
  const mode = (process.env.AGENT_MODE ?? "scripted") as "scripted" | "llm";
  const start = performance.now();

  if (mode === "llm") {
    try {
      const proposal = await proposeWithLLM(scenario);
      return { proposal, latencyMs: performance.now() - start, mode: "llm" };
    } catch (err) {
      console.warn(`[agent] LLM mode failed, falling back to scripted: ${(err as Error).message}`);
    }
  }

  // Scripted mode simulates the network round trip a real LLM call would
  // make, so the architecture's latency story (slow agent path vs. fast
  // guardrail path) holds true even without a live model behind it.
  await sleep(400 + Math.random() * 400);
  const proposal = SCRIPTED_PROPOSALS[scenario];
  return { proposal, latencyMs: performance.now() - start, mode: "scripted" };
}

async function proposeWithLLM(scenario: ScenarioId): Promise<Proposal> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const query = SCENARIOS.find((s) => s.id === scenario)?.query ?? "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            `You are a procurement decision agent. Given the request below, propose a reorder decision as ` +
            `strict JSON with keys component, vendor, quantity, unitPrice, leadTimeDays, totalCost, rationale. ` +
            `No prose outside the JSON.\n\nRequest: ${query}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  const parsed = JSON.parse(text);
  return parsed as Proposal;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

