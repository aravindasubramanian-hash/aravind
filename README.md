# Ops Decision Guardrail

A reliability, security, and evaluation layer for AI ops/procurement decision agents — built for the **YC Fall 2026 × Moss Zero Latency Builder Sprint** (theme: *Agent Reliability, Security and Evaluation*).

An AI agent proposes a procurement decision (vendor, quantity, price, lead time). Before that decision reaches an ERP or a vendor, this guardrail independently checks every claim in it against the real vendor contracts and company policy — retrieved from [Moss](https://www.moss.dev) in-process, in single-digit milliseconds — and returns a **PASS / FLAG / BLOCK** verdict with a confidence score, per-claim citations, and latency numbers.

See the [PRD](./docs/PRD.md) and [architecture doc](./docs/architecture.md) for the full product and technical rationale, and [DEMO.md](./DEMO.md) for a judge-facing walkthrough of the six scenarios.

## Why this exists

An LLM agent states a number with total confidence whether or not it's true. In ops, a wrong number isn't a bad chat reply — it's a purchase order. This project shows that an agent's output can be checked against ground truth *without* adding the network round trip that would kill real-time use, because Moss's retrieval runs in the same process as the check itself.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a scenario, click **Run decision**. It works immediately with no API keys — the six scenarios are scripted and deterministic (see below) and the retrieval layer defaults to an in-process mock that mirrors Moss's own query interface exactly.

## Running the tests

```bash
npm test
```

23 tests across three files: end-to-end scenario coverage (every scenario below resolves to its documented verdict — this is the assertion the whole demo depends on), guardrail unit tests (including regression tests for two bugs a pre-submission review caught: a dropped citation on price mismatches, and lead time never actually being verified), and `MockMossStore` retrieval tests. See [evaluation/](./evaluation/) for a judge-readable summary of the same results.

## The six demo scenarios

| Scenario | What's wrong | Verdict |
|---|---|---|
| Correct reorder | Nothing — every claim matches policy | **PASS** |
| Price mismatch | Agent claims ₹189/unit; contract says ₹211.50 | **FLAG** |
| Below minimum order qty | Agent orders 1,500 units; Vendor B's MOQ is 3,000 | **FLAG** |
| Unapproved vendor | Vendor C is contracted for a *different* component, not this one | **BLOCK** |
| Exceeds budget cap | Total cost is ₹19,03,500; the auto-issue cap is ₹18,00,000 | **BLOCK** |
| Unknown vendor | Vendor D has no records anywhere in the policy corpus | **FLAG** |

The guardrail treats "we checked and this is a confirmed violation" (BLOCK) differently from "we have no data on this at all" (FLAG, needs a human) — both fail closed, but with different severity, which is itself a small reliability design decision worth noticing in the code (`lib/guardrail.ts`).

## Switching on real Moss

By default the app runs on `MockMossStore` (`lib/moss.ts`), an in-process store that implements the exact same interface as the real Moss client, over the same policy corpus (`lib/policies.ts`). To use live Moss instead:

1. Sign up at [moss.dev](https://www.moss.dev) and create a project.
2. Copy `.env.example` to `.env.local` and set `MOSS_PROJECT_ID` and `MOSS_PROJECT_KEY`.
3. Restart the app. `getMossStore()` in `lib/moss.ts` picks `LiveMossStore` automatically once both are set, indexes the same policy corpus into Moss on first request, and falls back to the mock (with a console warning) if anything about the live path fails.

No other code changes — the guardrail and agent only ever talk to the `MossStore` interface, never to a specific backend.

## Switching on a real LLM agent

By default `AGENT_MODE=scripted` — deterministic, reproducible, no key needed. Set `AGENT_MODE=llm` and `ANTHROPIC_API_KEY` in `.env.local` to have the agent generate a live proposal from the scenario's free-text query instead (`lib/agent.ts`). If the call fails for any reason, it falls back to the scripted proposal.

## Architecture

```
Ops user → Decision Agent --(network hop, ~0.5-2s)--> LLM
                 |
                 v
         Structured proposal
                 |
                 v
   ┌─────────────────────────────────────────┐
   │ In-process, no network hop, <10ms        │
   │                                           │
   │  Claim Extractor → Moss Index             │
   │        |         (contracts, budget,      │
   │        v          reorder policy)         │
   │   Comparator                              │
   │        |                                  │
   │        v                                  │
   │  Verdict Engine → PASS / FLAG / BLOCK      │
   └─────────────────────────────────────────┘
                 |
        ┌────────┴────────┐
        v                 v
   Audit Log          Dashboard
```

See [docs/architecture.md](./docs/architecture.md) for the full component breakdown and the interactive version of this diagram.

## Project structure

```
app/
  page.tsx            Demo UI — scenario picker, proposal, verdict, audit log
  api/decide/route.ts  POST runs agent + guardrail, GET returns audit history
lib/
  types.ts            Shared types (Proposal, ClaimResult, GuardrailResult, ...)
  policies.ts         The synthetic knowledge base (vendor contracts, policy caps)
  moss.ts             MossStore interface + MockMossStore + LiveMossStore
  agent.ts            Decision agent (scripted scenarios + optional LLM mode)
  guardrail.ts         Claim extraction, comparison, scoring, verdict roll-up
  auditLog.ts          In-memory audit trail
tests/
  scenarios.test.ts    End-to-end: every scenario resolves to its documented verdict
  guardrail.test.ts    Unit coverage for claim extraction, citations, verdict roll-up
  moss.test.ts         MockMossStore retrieval tests
docs/
  PRD.md               Full product requirements doc
  architecture.md       Component breakdown + diagram
evaluation/
  scenarios.json       Machine-readable expected vs. actual verdict for each scenario
  README.md            Judge-readable summary of the latest test run
```

## What's out of scope (by design, for a 3-day sprint)

Multi-domain support beyond procurement, real ERP/contract-system integration, auth, a production agent with open-ended tool use, human-in-the-loop approval workflows, and compliance export formats. See the [PRD](./docs/PRD.md) for the full scope call.

## Deploying

This is a standard Next.js 16 app (App Router) — deploys to Vercel with no configuration:

```bash
npx vercel deploy
```

Set `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` (and optionally `AGENT_MODE=llm` + `ANTHROPIC_API_KEY`) as environment variables on the host if you want live Moss / a live agent in production; otherwise it runs on the mock, which is fully functional for a demo.

---

Built for the [YC Fall 2026 × Moss Zero Latency Builder Sprint](https://app.hidevs.xyz/hackathons/yc-fall-2026-moss-zero-latency-builder-sprint).

