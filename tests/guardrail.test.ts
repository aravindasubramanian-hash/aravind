import { describe, expect, it } from "vitest";
import { evaluateProposal } from "../lib/guardrail";
import type { Proposal } from "../lib/types";

// Unit-level coverage for the guardrail's claim logic, independent of the
// scripted agent scenarios in scenarios.test.ts. These pin down two bugs
// found during a competition-readiness review of this repo:
//   1. unit_price claims didn't carry a citationId/retrievedText, so the UI
//      silently dropped the source citation for price mismatches.
//   2. leadTimeDays was part of the Proposal type and the PRD's "checks
//      every claim" promise, but the guardrail never actually verified it.

const baseProposal: Proposal = {
  component: "Component X",
  vendor: "Vendor A",
  quantity: 6000,
  unitPrice: 211.5,
  leadTimeDays: 15,
  totalCost: 6000 * 211.5,
  rationale: "test fixture",
};

describe("claim coverage", () => {
  it("extracts and evaluates every claim named in the PRD, including lead time", async () => {
    const result = await evaluateProposal(baseProposal);
    const fields = result.claims.map((c) => c.field).sort();
    expect(fields).toEqual(["approved", "lead_time_days", "moq", "po_budget_cap", "unit_price"].sort());
  });

  it("a correct proposal against a known vendor is fully grounded with citations", async () => {
    const result = await evaluateProposal(baseProposal);
    expect(result.verdict).toBe("PASS");
    for (const claim of result.claims) {
      expect(claim.status).toBe("grounded");
      expect(claim.citationId).toBeTruthy();
      expect(claim.retrievedText).toBeTruthy();
    }
  });
});

describe("unit_price citation (regression: was silently dropped)", () => {
  it("a flagged price mismatch still carries citationId and retrievedText", async () => {
    const result = await evaluateProposal({ ...baseProposal, unitPrice: 189 });
    const priceClaim = result.claims.find((c) => c.field === "unit_price")!;
    expect(priceClaim.status).toBe("flagged");
    expect(priceClaim.citationId).toBe("vendorA-x-price");
    expect(priceClaim.retrievedText).toContain("₹211.50");
  });

  it("a grounded price match also carries citationId and retrievedText", async () => {
    const result = await evaluateProposal(baseProposal);
    const priceClaim = result.claims.find((c) => c.field === "unit_price")!;
    expect(priceClaim.status).toBe("grounded");
    expect(priceClaim.citationId).toBe("vendorA-x-price");
  });
});

describe("lead time verification (regression: was never checked)", () => {
  it("flags a lead time that doesn't match the contract", async () => {
    const result = await evaluateProposal({ ...baseProposal, leadTimeDays: 5 });
    const leadTimeClaim = result.claims.find((c) => c.field === "lead_time_days")!;
    expect(leadTimeClaim.status).toBe("flagged");
    expect(leadTimeClaim.citationId).toBe("vendorA-x-leadtime");
    expect(result.verdict).toBe("FLAG");
  });

  it("is unverifiable for a vendor with no lead-time record on file", async () => {
    const result = await evaluateProposal({
      ...baseProposal,
      vendor: "Vendor D",
      leadTimeDays: 10,
    });
    const leadTimeClaim = result.claims.find((c) => c.field === "lead_time_days")!;
    expect(leadTimeClaim.status).toBe("unverifiable");
  });
});

describe("verdict roll-up", () => {
  it("a single critical flag is enough to BLOCK regardless of other claims", async () => {
    const result = await evaluateProposal({ ...baseProposal, totalCost: 9_999_999 });
    expect(result.verdict).toBe("BLOCK");
  });

  it("confidence score is 1 only when every claim is grounded", async () => {
    const grounded = await evaluateProposal(baseProposal);
    expect(grounded.confidence).toBe(1);

    const withUnverifiable = await evaluateProposal({ ...baseProposal, vendor: "Vendor D" });
    expect(withUnverifiable.confidence).toBeLessThan(1);
  });
});
