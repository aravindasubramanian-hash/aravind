# Demo walkthrough

A judge-facing script for running through all six scenarios. Total time: about 3 minutes. No API keys required — everything below runs on the default `AGENT_MODE=scripted` + `MockMossStore` configuration.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Each scenario is a button; click one, then **Run decision**. The UI shows, in order: the query, the agent's raw proposal, a claim-by-claim breakdown with citations back to the source policy fact, the rolled-up verdict, and the end-to-end latency. Every run also appends to the audit log at the bottom of the page.

## The six scenarios, in the order to demo them

**1. Correct reorder — expect PASS**
Query: *"We're low on Component X — should we reorder from Vendor A, and how much?"*
The agent proposes 6,000 units from Vendor A at ₹211.50/unit, 15-day lead time. Every one of the five claims (approval, unit price, lead time, MOQ, budget cap) matches the policy corpus exactly — this is the baseline that shows the guardrail isn't just reflexively suspicious.

**2. Price mismatch — expect FLAG**
Query: *"Reorder Component X from Vendor A — confirm the price and quantity."*
The agent claims ₹189/unit; Vendor A's actual contract price is ₹211.50. Point out the citation on the flagged claim (`vendorA-x-price`) — that's the "show your work" part of the guardrail, not just a red/green light.

**3. Below minimum order quantity — expect FLAG**
Query: *"We only need a small top-up of Component X — order a small batch from Vendor B."*
The agent proposes 1,500 units; Vendor B's contracted MOQ is 3,000. A real order at this quantity would bounce off the vendor's own system — the guardrail catches it before it gets that far.

**4. Unapproved vendor — expect BLOCK**
Query: *"Vendor C offered a good deal — reorder Component X from them."*
Vendor C is a real, known vendor — just not approved for *this* component (they're contracted for a different one). This is the scenario worth narrating carefully: it's not "unknown vendor," it's "known vendor, wrong context," which a naive keyword check would miss and the guardrail's exact metadata-filtered lookup catches.

**5. Exceeds budget cap — expect BLOCK**
Query: *"Place a large reorder of Component X from Vendor A to build up a buffer."*
9,000 units at the correct ₹211.50/unit price is ₹19,03,500 — over the ₹18,00,000 auto-issue cap. Every individual claim (vendor, price, lead time) is independently correct; only the aggregate crosses a policy line. Good scenario for showing the guardrail checks derived values, not just claim-by-claim facts in isolation.

**6. Unknown vendor — expect FLAG**
Query: *"A new supplier, Vendor D, is offering Component X — reorder from them."*
Vendor D has zero records in the policy corpus. This is deliberately a *different* failure mode from #4: "we checked and it's wrong" (BLOCK) versus "we have no data to check against" (FLAG, routed to a human) are different severities in this design, and conflating them would be its own reliability bug. Worth pointing out explicitly.

## What to say about the architecture

The agent's own proposal step is the slow, untrusted part (simulated at 400–800ms scripted delay, standing in for a real LLM call). Everything after that — claim extraction, the Moss lookup, comparison, verdict — runs in-process and lands under 1ms per claim in every scenario except the fully-correct one (which checks five claims sequentially and still finishes in ~14ms). See [evaluation/](./evaluation/) for the actual captured numbers and [docs/architecture.md](./docs/architecture.md) for the full diagram.

## If asked "what would break this"

The honest answer, and it's in the PRD's Risks & Open Questions: this ships with a synthetic ~10-15-fact policy corpus and a mock retrieval store by default. Swapping in live Moss (`.env.example` has the two variables) changes only the retrieval backend — the guardrail and agent code never talk to a specific backend, only the `MossStore` interface — but a real deployment would need the actual contract/policy corpus indexed, not this demo set. That's explicitly out of scope for the sprint, not swept under the rug.
