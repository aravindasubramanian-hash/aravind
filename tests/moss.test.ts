import { describe, expect, it } from "vitest";
import { getMossStore } from "../lib/moss";

// Covers the MockMossStore that stands in for the real Moss client when no
// MOSS_PROJECT_ID/KEY are set (the default for this repo, and for judges
// cloning it without a Moss account). Its exact-match getFact() is what the
// guardrail's claim checks depend on; search() is what distinguishes a
// "known vendor, wrong component" BLOCK from a "vendor we've never heard of"
// FLAG in lib/guardrail.ts.

describe("MockMossStore", () => {
  it("falls back to the mock backend with no Moss credentials set", async () => {
    const store = await getMossStore();
    expect(store.backend).toBe("mock");
  });

  it("getFact returns an exact metadata match for a known (component, field, vendor)", async () => {
    const store = await getMossStore();
    const { fact } = await store.getFact("Component X", "unit_price", "Vendor A");
    expect(fact?.id).toBe("vendorA-x-price");
    expect(fact?.metadata.value).toBe(211.5);
  });

  it("getFact returns null for a combination with no policy fact", async () => {
    const store = await getMossStore();
    const { fact } = await store.getFact("Component X", "unit_price", "Vendor D");
    expect(fact).toBeNull();
  });

  it("search finds a single-letter vendor suffix (regression: short tokens used to be dropped)", async () => {
    const store = await getMossStore();
    const { results } = await store.search("Vendor C", 5);
    expect(results.some((f) => f.metadata.vendor === "Vendor C")).toBe(true);
  });

  it("search does not surface an unrelated vendor for a vendor with zero records", async () => {
    const store = await getMossStore();
    const { results } = await store.search("Vendor D", 5);
    expect(results.some((f) => f.metadata.vendor === "Vendor D")).toBe(false);
  });
});
