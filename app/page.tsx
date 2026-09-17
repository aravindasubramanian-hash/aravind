"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { DecisionRecord, ScenarioId } from "@/lib/types";

const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "correct", label: "Correct reorder (should PASS)" },
  { id: "price_mismatch", label: "Price mismatch (should FLAG)" },
  { id: "moq_violation", label: "Below minimum order qty (should FLAG)" },
  { id: "unapproved_vendor", label: "Unapproved vendor (should BLOCK)" },
  { id: "budget_overrun", label: "Exceeds budget cap (should BLOCK)" },
  { id: "unverifiable_vendor", label: "Unknown vendor (should FLAG)" },
];

export default function Home() {
  const [scenario, setScenario] = useState<ScenarioId>("correct");
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<DecisionRecord | null>(null);
  const [history, setHistory] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/decide")
      .then((r) => r.json())
      .then((d) => setHistory(d.records ?? []))
      .catch(() => {});
  }, []);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      const entry: DecisionRecord = await res.json();
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, 50));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.wrap}>
      <p className={styles.eyebrow}>Agent Reliability, Security &amp; Evaluation — YC × Moss Sprint</p>
      <h1 className={styles.title}>Ops Decision Guardrail</h1>
      <p className={styles.sub}>
        Pick a scenario. A decision agent proposes a procurement reorder; the guardrail checks every claim in
        that proposal against real vendor contracts and company policy, retrieved from Moss in-process, and
        returns a verdict with citations and latency — before the decision reaches an ERP or a vendor.
      </p>

      <div className={styles.scenarios}>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={`${styles.scenarioBtn} ${scenario === s.id ? styles.active : ""}`}
            onClick={() => setScenario(s.id)}
            disabled={loading}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.runRow}>
        <button className={styles.runBtn} onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run decision"}
        </button>
        <span className={styles.hint}>
          {loading ? "Agent proposing, then guardrail checking against Moss…" : "Agent → Guardrail → Verdict"}
        </span>
      </div>

      {error && (
        <div className={styles.card}>
          <p className={styles.claimDetail}>Error: {error}</p>
        </div>
      )}

      {current && (
        <>
          <div className={styles.card}>
            <p className={styles.cardTitle}>Query</p>
            <p style={{ margin: 0 }}>{current.query}</p>
          </div>

          <div className={styles.card}>
            <p className={styles.cardTitle}>
              Agent's proposal <span className="mono">· {current.agentLatencyMs.toFixed(0)}ms (network path)</span>
            </p>
            <div className={styles.proposalGrid}>
              <Field label="Component" value={current.proposal.component} />
              <Field label="Vendor" value={current.proposal.vendor} />
              <Field label="Quantity" value={`${current.proposal.quantity.toLocaleString()} units`} />
              <Field label="Unit price" value={`$${current.proposal.unitPrice.toFixed(2)}`} />
              <Field label="Lead time" value={`${current.proposal.leadTimeDays} days`} />
              <Field label="Total cost" value={`$${current.proposal.totalCost.toLocaleString()}`} />
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.verdictRow}>
              <span className={`${styles.verdictBadge} ${styles["verdict" + current.guardrail.verdict]}`}>
                {current.guardrail.verdict}
              </span>
              <span className={styles.latency}>
                confidence <b>{Math.round(current.guardrail.confidence * 100)}%</b>
              </span>
              <span className={styles.latency}>
                guardrail latency <b>{current.guardrail.totalLatencyMs.toFixed(2)}ms</b> (Moss only:{" "}
                <b>{current.guardrail.mossOnlyLatencyMs.toFixed(2)}ms</b>)
              </span>
            </div>

            {current.guardrail.claims.map((c) => (
              <div key={c.field} className={styles.claim}>
                <div className={styles.claimHead}>
                  <span className={styles.claimLabel}>{c.label}</span>
                  <span className={`${styles.claimStatus} ${styles["status" + c.status]}`}>{c.status}</span>
                </div>
                <p className={styles.claimDetail}>{c.detail}</p>
                {c.citationId && <p className={styles.citation}>cited: {c.retrievedText} ({c.citationId})</p>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className={styles.card}>
        <p className={styles.cardTitle}>Audit log</p>
        {history.length === 0 ? (
          <p className={styles.empty}>No decisions evaluated yet.</p>
        ) : (
          <div className={styles.history}>
            {history.map((h) => (
              <div key={h.id} className={styles.historyRow}>
                <span className={`${styles.verdictBadge} ${styles["verdict" + h.guardrail.verdict]}`}>
                  {h.guardrail.verdict}
                </span>
                <span className={styles.historyQuery}>{h.query}</span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {h.guardrail.totalLatencyMs.toFixed(1)}ms
                </span>
                <span className="mono" style={{ fontSize: 12 }}>
                  {new Date(h.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}
