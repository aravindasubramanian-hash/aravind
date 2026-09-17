# Evaluation

This is the evaluation the project's premise rests on: for each of the six scripted scenarios (`lib/agent.ts`), does the guardrail independently reach the documented verdict, and does it do so fast?

`scenarios.json` in this folder is generated output, not hand-written — it's the actual `proposeDecision()` → `evaluateProposal()` result for every scenario, captured straight from the code (the same functions `tests/scenarios.test.ts` exercises under `vitest`). Regenerate it any time with:

```bash
npx tsx <(cat <<'EOF'
import { SCENARIOS, proposeDecision } from "./lib/agent";
import { evaluateProposal } from "./lib/guardrail";
for (const s of SCENARIOS) {
  const { proposal } = await proposeDecision(s.id);
  console.log(s.id, (await evaluateProposal(proposal)).verdict);
}
EOF
)
```

or more simply, run `npm test` — `tests/scenarios.test.ts` asserts the same six verdicts on every CI run.

## Results (latest run)

| Scenario | Expected | Actual | Result | Moss-only latency | Total guardrail latency |
|---|---|---|---|---|---|
| `correct` | PASS | PASS | ✅ | 0.06 ms | 13.9 ms |
| `price_mismatch` | FLAG | FLAG | ✅ | 0.04 ms | 0.6 ms |
| `moq_violation` | FLAG | FLAG | ✅ | 0.02 ms | 0.1 ms |
| `unapproved_vendor` | BLOCK | BLOCK | ✅ | 0.33 ms | 0.7 ms |
| `budget_overrun` | BLOCK | BLOCK | ✅ | 0.01 ms | 0.1 ms |
| `unverifiable_vendor` | FLAG | FLAG | ✅ | 0.05 ms | 0.1 ms |

**6/6 scenarios resolve to their documented verdict — 100% catch rate**, well inside the PRD's ~50ms end-to-end / <10ms Moss-retrieval budget in every case (the `correct` scenario's 13.9ms total includes five sequential claim lookups; each individual Moss call still lands under a millisecond). These numbers are from the in-process `MockMossStore` — the interface `LiveMossStore` implements identically, so swapping in real Moss changes the retrieval backend, not the latency shape.

## What each row confirms

`correct` and the two FLAG-by-mismatch rows (`price_mismatch`, `moq_violation`) confirm the comparator catches a wrong number even when everything else about the proposal is fine. `unapproved_vendor` and `budget_overrun` confirm a critical-severity claim forces BLOCK regardless of what else is true (`tests/scenarios.test.ts`'s "BLOCK scenarios always carry a claim at critical severity" test pins this down). `unverifiable_vendor` confirms the guardrail distinguishes "checked and it's wrong" from "we have no data" — both fail closed to a non-PASS verdict, but only a confirmed violation escalates to BLOCK; no-data degrades to FLAG-for-human-review instead, which is itself a small reliability design decision worth noticing (see `docs/PRD.md`'s Solution Overview).

Full per-claim detail — including which citation backs each grounded/flagged claim — is in `scenarios.json`.
