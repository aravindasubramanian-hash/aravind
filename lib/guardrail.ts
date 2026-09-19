import { getMossStore } from "./moss";
import { Claim, ClaimResult, GuardrailResult, PolicyFact, Proposal, Verdict } from "./types";

const PRICE_TOLERANCE = 0.02; // 2% — treat tiny rounding differences as grounded, not flagged
const LEAD_TIME_TOLERANCE = 0; // contracted lead time is a fixed commitment — no slack

function extractClaims(p: Proposal): Claim[] {
  return [
    { field: "approved", label: "Vendor is approved for this component", claimedValue: p.vendor },
    { field: "unit_price", label: "Unit price", claimedValue: p.unitPrice, unit: "INR" },
    { field: "moq", label: "Order quantity vs. minimum order quantity", claimedValue: p.quantity, unit: "units" },
    { field: "lead_time_days", label: "Lead time vs. contracted lead time", claimedValue: p.leadTimeDays, unit: "days" },
    { field: "po_budget_cap", label: "Total cost vs. purchase-order cap", claimedValue: p.totalCost, unit: "INR" },
  ];
}

/**
 * Runs every claim in the agent's proposal through Moss, in-process, and
 * compares it against the retrieved fact. This is the "in-process, no
 * network hop" path from the architecture diagram — the whole function
 * typically completes in single-digit milliseconds because each Moss query
 * does too.
 */
export async function evaluateProposal(p: Proposal): Promise<GuardrailResult> {
  const store = await getMossStore();
  const claims = extractClaims(p);
  const results: ClaimResult[] = [];
  let mossOnlyLatencyMs = 0;
  const overallStart = performance.now();

  for (const claim of claims) {
    if (claim.field === "approved") {
      const { fact, latencyMs } = await store.getFact(p.component, "approved", p.vendor);
      mossOnlyLatencyMs += latencyMs;
      if (!fact) {
        // No approval record for this (vendor, component) pair. Distinguish
        // two very different situations before deciding how hard to fail:
        // a vendor the corpus knows about (just not for this component) is a
        // confirmed policy violation; a vendor the corpus has never heard of
        // is missing data, not a confirmed violation — fail closed either
        // way, but only the confirmed case is severe enough to BLOCK.
        const { results: nearby, latencyMs: searchLatencyMs } = await store.search(p.vendor, 5);
        mossOnlyLatencyMs += searchLatencyMs;
        const vendorKnown = nearby.some((f) => f.metadata.vendor === p.vendor);

        results.push({
          ...claim,
          status: vendorKnown ? "flagged" : "unverifiable",
          severity: vendorKnown ? "critical" : "warning",
          retrievedText: undefined,
          latencyMs: latencyMs + searchLatencyMs,
          detail: vendorKnown
            ? `${p.vendor} has contract records for other components, but none approving them for ${p.component} — this is a confirmed policy violation.`
            : `${p.vendor} has no records anywhere in the policy corpus — this vendor hasn't been vetted, so the decision needs a human before it proceeds.`,
        });
      } else {
        results.push({
          ...claim,
          status: "grounded",
          severity: "info",
          retrievedValue: fact.metadata.value,
          retrievedText: fact.text,
          citationId: fact.id,
          latencyMs,
          detail: `${p.vendor} is an approved supplier for ${p.component}.`,
        });
      }
      continue;
    }

    if (claim.field === "unit_price") {
      const { fact, latencyMs } = await store.getFact(p.component, "unit_price", p.vendor);
      mossOnlyLatencyMs += latencyMs;
      results.push(compareNumeric(claim, fact, p.unitPrice, PRICE_TOLERANCE, latencyMs, {
        grounded: (retrieved) => `Matches Vendor contract price of ₹${retrieved}.`,
        flagged: (retrieved) =>
          `Proposal claims ₹${p.unitPrice}/unit, but the contracted price for ${p.vendor} is ₹${retrieved}/unit.`,
        unverifiable: `No contracted price on file for ${p.vendor} on ${p.component}.`,
      }));
      continue;
    }

    if (claim.field === "lead_time_days") {
      const { fact, latencyMs } = await store.getFact(p.component, "lead_time_days", p.vendor);
      mossOnlyLatencyMs += latencyMs;
      results.push(compareNumeric(claim, fact, p.leadTimeDays, LEAD_TIME_TOLERANCE, latencyMs, {
        grounded: (retrieved) => `Matches ${p.vendor}'s contracted lead time of ${retrieved} days.`,
        flagged: (retrieved) =>
          `Proposal claims a ${p.leadTimeDays}-day lead time, but ${p.vendor}'s contracted lead time for ${p.component} is ${retrieved} days.`,
        unverifiable: `No contracted lead time on file for ${p.vendor} on ${p.component}.`,
      }));
      continue;
    }

    if (claim.field === "moq") {
      const { fact, latencyMs } = await store.getFact(p.component, "moq", p.vendor);
      mossOnlyLatencyMs += latencyMs;
      if (!fact) {
        results.push({
          ...claim,
          status: "unverifiable",
          severity: "warning",
          latencyMs,
          detail: `No minimum-order-quantity record on file for ${p.vendor} on ${p.component}.`,
        });
      } else {
        const moq = Number(fact.metadata.value);
        const ok = p.quantity >= moq;
        results.push({
          ...claim,
          status: ok ? "grounded" : "flagged",
          severity: ok ? "info" : "warning",
          retrievedValue: moq,
          retrievedText: fact.text,
          citationId: fact.id,
          latencyMs,
          detail: ok
            ? `${p.quantity} units meets ${p.vendor}'s minimum order quantity of ${moq}.`
            : `${p.quantity} units is below ${p.vendor}'s minimum order quantity of ${moq} — this order cannot be placed as specified.`,
        });
      }
      continue;
    }

    if (claim.field === "po_budget_cap") {
      const { fact, latencyMs } = await store.getFact("*", "po_budget_cap");
      mossOnlyLatencyMs += latencyMs;
      const cap = fact ? Number(fact.metadata.value) : undefined;
      const ok = cap === undefined ? undefined : p.totalCost <= cap;
      results.push({
        ...claim,
        status: ok === undefined ? "unverifiable" : ok ? "grounded" : "flagged",
        severity: ok === undefined ? "warning" : ok ? "info" : "critical",
        retrievedValue: cap,
        retrievedText: fact?.text,
        citationId: fact?.id,
        latencyMs,
        detail:
          ok === undefined
            ? "No purchase-order budget policy on file."
            : ok
            ? `Total cost of ₹${p.totalCost.toLocaleString("en-IN")} is within the ₹${cap!.toLocaleString("en-IN")} auto-issue cap.`
            : `Total cost of ₹${p.totalCost.toLocaleString("en-IN")} exceeds the ₹${cap!.toLocaleString("en-IN")} cap — this requires manual approval, not agent auto-issue.`,
      });
      continue;
    }
  }

  const totalLatencyMs = performance.now() - overallStart;
  const verdict = rollUpVerdict(results);
  const confidence = scoreConfidence(results);

  return { verdict, confidence, claims: results, totalLatencyMs, mossOnlyLatencyMs };
}

function compareNumeric(
  claim: Claim,
  fact: PolicyFact | null,
  claimedValue: number,
  tolerance: number,
  latencyMs: number,
  messages: { grounded: (r: number) => string; flagged: (r: number) => string; unverifiable: string }
): ClaimResult {
  if (!fact) {
    return {
      ...claim,
      status: "unverifiable",
      severity: "warning",
      latencyMs,
      detail: messages.unverifiable,
    };
  }
  const retrieved = Number(fact.metadata.value);
  const withinTolerance =
    tolerance === 0 ? claimedValue === retrieved : Math.abs(claimedValue - retrieved) / retrieved <= tolerance;
  return {
    ...claim,
    status: withinTolerance ? "grounded" : "flagged",
    severity: withinTolerance ? "info" : "warning",
    retrievedValue: retrieved,
    retrievedText: fact.text,
    citationId: fact.id,
    detail: withinTolerance ? messages.grounded(retrieved) : messages.flagged(retrieved),
    latencyMs,
  };
}

function rollUpVerdict(results: ClaimResult[]): Verdict {
  if (results.some((r) => r.status === "flagged" && r.severity === "critical")) return "BLOCK";
  if (results.some((r) => r.status === "flagged")) return "FLAG";
  if (results.some((r) => r.status === "unverifiable")) return "FLAG";
  return "PASS";
}

function scoreConfidence(results: ClaimResult[]): number {
  const weight = { grounded: 1, unverifiable: 0.4, flagged: 0 } as const;
  const total = results.reduce((acc, r) => acc + weight[r.status], 0);
  return Math.max(0, Math.min(1, total / results.length));
}

