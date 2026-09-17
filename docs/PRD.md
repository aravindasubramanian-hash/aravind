# Ops Decision Guardrail — PRD

Built for the YC Fall 2026 × Moss Zero Latency Builder Sprint (theme: *Agent Reliability, Security and Evaluation*).

## Problem & Opportunity

Operations and procurement teams are starting to let AI agents propose real decisions — reorder quantities, vendor selection, safety-stock levels — because the decisions are repetitive and the underlying data (contracts, policies, past orders) is too large for a human to hold in their head. But an LLM agent states a number with total confidence whether or not that number is true: a fabricated unit price, a MOQ that violates the real contract, a reorder quantity that blows through a budget cap. In ops, a wrong number isn't a bad chat reply — it's a purchase order, a vendor commitment, or a stockout.

The Agent Reliability, Security and Evaluation theme is about exactly this: agents are only trustworthy in production if every claim they make can be checked, fast, against ground truth, without adding latency that kills real-time use. Moss's sub-10ms retrieval makes it possible to check every claim in an agent's output against the real policy and contract corpus before that output reaches a human or a downstream system — without the round-trip cost of a traditional vector database.

## Target User & Use Case

**Primary user:** an operations or procurement analyst — or the ops manager reviewing their team's recommendations — at a company that already uses, or is being asked to trust, an AI copilot for reorder and vendor decisions. Moment of use: right after the copilot proposes a decision ("reorder 5,000 units of Component X from Vendor A at $2.10/unit, 15-day lead time") and before that decision is acted on — sent to a vendor, entered into the ERP, or approved.

**Secondary user:** whoever owns AI governance for the ops function, who needs proof that every agent-driven decision was checked against policy, not just generated, and an audit trail to point to when a decision is questioned.

## Solution Overview

Ops Decision Guardrail sits between a procurement/reorder decision agent and whoever acts on its output. The agent proposes a decision as structured data — vendor, quantity, unit price, lead time, total cost. The Guardrail layer independently retrieves the actual governing facts for that decision — vendor contract terms, budget caps, reorder-point policy — from a Moss-indexed knowledge base in single-digit milliseconds, and checks every claim in the agent's proposal against what it finds.

Each claim is marked grounded (matches policy), flagged (contradicts policy or contract), or unverifiable (no matching fact found). These roll up into one verdict — PASS, FLAG FOR REVIEW, or BLOCK — with a confidence score, plus a logged retrieval trail (document, value, comparison) so every decision is auditable after the fact. The guardrail never rewrites or improves the agent's decision; it only says whether to trust it, and shows its work.

## Core User Flow

1. A user submits an ops query — e.g. "We're at 800 units of Component X, safety stock is 1,200 — should we reorder from Vendor A, and how much?"
2. The Decision Agent generates a structured proposal: vendor, quantity, unit price, lead time, total cost, and its rationale.
3. The Guardrail extracts each factual claim from the proposal and issues one Moss query per claim (e.g. vendor = Vendor A, field = unit_price) against the indexed policy/contract corpus, using metadata filtering for exact fact lookup.
4. Each claim is compared to the retrieved fact: within tolerance → grounded; outside tolerance or contradicted → flagged; no match found → unverifiable.
5. The Guardrail computes a confidence score and verdict (PASS / FLAG / BLOCK) from the mix of grounded, flagged, and unverifiable claims.
6. The dashboard shows the query, the agent's raw proposal, a claim-by-claim breakdown with citations back to the source policy text, the verdict, and the end-to-end guardrail latency — proving the safety layer doesn't cost real-time performance.
7. Every request/response pair is written to an audit log the user can scroll back through.

## Scope for the Hackathon Build

**In scope:** a single ops domain (procurement reorder decisions for a handful of synthetic vendors and components); a Moss-indexed corpus of roughly 10–15 policy and contract facts; a decision agent that proposes decisions and sometimes gets a value wrong on purpose, so the guardrail's catches are visible on demo; the claim-extraction, Moss-lookup, and comparison guardrail; confidence scoring and PASS/FLAG/BLOCK verdicts; a single-page demo UI; an audit log; and latency instrumentation on the guardrail path.

**Out of scope for this sprint:** multi-domain support beyond procurement, real ERP or contract-system integration, user auth or multi-tenant accounts, a production-grade agent with open-ended tool use, human-in-the-loop approval workflows, and enterprise audit/compliance export formats. These are named as "what's next" in the demo, not built.

## Success Metrics

**For the hackathon demo:** the guardrail catches every deliberately injected error in the demo script (target: 100% catch rate); end-to-end guardrail latency stays under roughly 50ms including the agent's own generation step, with the Moss retrieval portion under 10ms; every verdict shown in the UI carries a citation a judge can click through to the source policy text.

**For a real deployment** (framed for the PRD, not measured this sprint): reduction in decisions reaching execution with a contract or policy mismatch; share of agent-proposed decisions that get a PASS verdict without human review, as an efficiency signal; and time-to-audit for a disputed decision, which should drop from searching email and the ERP to looking up the logged trail.

## Architecture Summary

Three layers: (1) a small structured knowledge base of vendor contracts, budget policy, and reorder-policy documents, indexed into Moss with metadata (vendor, field, value) so facts can be fetched by exact filter as well as semantic query; (2) a Decision Agent that proposes an ops decision as structured JSON; (3) the Guardrail service, which issues one Moss query per claim in the agent's output, compares the result, scores confidence, and returns a verdict with citations and latency metrics. A thin web UI calls the agent and guardrail in sequence and renders the query, proposal, verdict, and audit trail. See [architecture.md](./architecture.md) for the full component diagram.

## Risks & Open Questions

Moss needs a project ID and API key from a free signup at moss.dev — the build defaults to a local mock matching Moss's query interface so it runs without credentials, and swaps to live Moss once they're provided (see `.env.example`). Deployment target (Vercel vs. another host) is still to be decided. Team size assumed at one.

---

*This document mirrors the living PRD drafted during the build; see the [shared PRD doc](https://claude.ai/code/artifact/46a0173d-66ca-4900-8c57-523be99a6eaa) for the version with live comments.*
