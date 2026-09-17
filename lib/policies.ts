import { PolicyFact } from "./types";

// A small synthetic knowledge base standing in for a company's real
// procurement system: vendor contract terms, an approved-vendor list, and
// company-wide policy caps. Each fact carries both a natural-language `text`
// (for semantic search) and structured `metadata` (for exact-filter lookup)
// — Moss supports both, and the guardrail uses the metadata path for its
// claim checks because it wants an exact fact, not a similar one.

export const POLICY_FACTS: PolicyFact[] = [
  // --- Vendor A — approved for Component X ---
  {
    id: "vendorA-x-price",
    text: "Vendor A's contracted unit price for Component X is $2.35 per unit.",
    metadata: { component: "Component X", vendor: "Vendor A", field: "unit_price", value: 2.35, unit: "USD" },
  },
  {
    id: "vendorA-x-moq",
    text: "Vendor A requires a minimum order quantity of 6,000 units for Component X.",
    metadata: { component: "Component X", vendor: "Vendor A", field: "moq", value: 6000, unit: "units" },
  },
  {
    id: "vendorA-x-leadtime",
    text: "Vendor A's standard lead time for Component X is 15 days.",
    metadata: { component: "Component X", vendor: "Vendor A", field: "lead_time_days", value: 15, unit: "days" },
  },
  {
    id: "vendorA-x-approved",
    text: "Vendor A is an approved supplier for Component X.",
    metadata: { component: "Component X", vendor: "Vendor A", field: "approved", value: true },
  },

  // --- Vendor B — approved for Component X ---
  {
    id: "vendorB-x-price",
    text: "Vendor B's contracted unit price for Component X is $2.60 per unit.",
    metadata: { component: "Component X", vendor: "Vendor B", field: "unit_price", value: 2.6, unit: "USD" },
  },
  {
    id: "vendorB-x-moq",
    text: "Vendor B requires a minimum order quantity of 3,000 units for Component X.",
    metadata: { component: "Component X", vendor: "Vendor B", field: "moq", value: 3000, unit: "units" },
  },
  {
    id: "vendorB-x-leadtime",
    text: "Vendor B's standard lead time for Component X is 9 days.",
    metadata: { component: "Component X", vendor: "Vendor B", field: "lead_time_days", value: 9, unit: "days" },
  },
  {
    id: "vendorB-x-approved",
    text: "Vendor B is an approved supplier for Component X.",
    metadata: { component: "Component X", vendor: "Vendor B", field: "approved", value: true },
  },

  // --- Vendor C — approved for Component Y only, NOT Component X ---
  {
    id: "vendorC-y-price",
    text: "Vendor C's contracted unit price for Component Y is $4.10 per unit.",
    metadata: { component: "Component Y", vendor: "Vendor C", field: "unit_price", value: 4.1, unit: "USD" },
  },
  {
    id: "vendorC-y-approved",
    text: "Vendor C is an approved supplier for Component Y.",
    metadata: { component: "Component Y", vendor: "Vendor C", field: "approved", value: true },
  },

  // --- Company-wide procurement policy ---
  {
    id: "policy-po-cap",
    text: "Purchase orders above $20,000 require additional approval and should not be auto-issued by an agent.",
    metadata: { component: "*", field: "po_budget_cap", value: 20000, unit: "USD" },
  },
  {
    id: "policy-reorder-x",
    text: "Component X should be reordered when on-hand inventory falls below the 1,200-unit safety stock threshold.",
    metadata: { component: "Component X", field: "reorder_point", value: 1200, unit: "units" },
  },
  {
    id: "policy-reorder-y",
    text: "Component Y should be reordered when on-hand inventory falls below the 800-unit safety stock threshold.",
    metadata: { component: "Component Y", field: "reorder_point", value: 800, unit: "units" },
  },
];

export function findFact(
  component: string,
  field: string,
  vendor?: string
): PolicyFact | undefined {
  return POLICY_FACTS.find(
    (f) =>
      f.metadata.field === field &&
      (f.metadata.component === component || f.metadata.component === "*") &&
      (vendor === undefined || f.metadata.vendor === vendor)
  );
}
