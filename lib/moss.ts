import { PolicyFact } from "./types";
import { POLICY_FACTS, findFact } from "./policies";

/**
 * MossStore is the one seam between this app and Moss. Both the real client
 * and the mock below implement the same three operations, so swapping one
 * for the other — which happens automatically based on whether
 * MOSS_PROJECT_ID / MOSS_PROJECT_KEY are set — never touches the guardrail
 * or agent code.
 *
 * Real Moss usage, verified against the installed @moss-dev/moss@1.7.1 type
 * declarations (node_modules/@moss-dev/moss-core/index.d.ts):
 *   const client = new MossClient(projectId, projectKey)
 *   await client.createIndex(indexName, docs)     // DocumentInfo[]: { id, text, metadata?: Record<string,string> }
 *   await client.loadIndex(indexName)              // downloads once, then queries run in-memory
 *   const { docs } = await client.query(indexName, text, { topK, filter })
 * Two things worth calling out because they're easy to get wrong from the
 * docs pages alone: query results come back as `SearchResult.docs`, not a
 * bare array — and `DocumentInfo.metadata` values must be strings (the SDK
 * types it as `Record<string, string>`), so numeric/boolean facts are
 * stringified on the way in. `QueryOptions.filter` is typed `any` with no
 * documented operator grammar, so this store treats it as best-effort
 * narrowing and always re-checks the returned docs' metadata client-side
 * before trusting a match — the guardrail's whole point is not trusting a
 * retrieval result blindly, and that applies to its own retrieval layer too.
 */
export interface MossQueryResult {
  fact: PolicyFact | null;
  latencyMs: number;
}

export interface MossSearchResult {
  results: PolicyFact[];
  latencyMs: number;
}

export interface MossStore {
  readonly backend: "moss" | "mock";
  init(): Promise<void>;
  /** Exact fact lookup by component/field(/vendor) — what the guardrail checks claims against. */
  getFact(component: string, field: string, vendor?: string): Promise<MossQueryResult>;
  /** Free-text semantic search over the policy corpus, topK results. */
  search(text: string, topK?: number): Promise<MossSearchResult>;
}

const INDEX_NAME = "ops-policies";

/** Moss stores metadata as Record<string,string> — stringify on the way in. */
function toMossMetadata(meta: PolicyFact["metadata"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) out[k] = String(v);
  }
  return out;
}

function fromMossDoc(doc: { id: string; text: string; metadata?: Record<string, string> }): PolicyFact {
  return { id: doc.id, text: doc.text, metadata: (doc.metadata ?? {}) as PolicyFact["metadata"] };
}

class MockMossStore implements MossStore {
  readonly backend = "mock" as const;
  private facts: PolicyFact[] = POLICY_FACTS;

  async init(): Promise<void> {
    // No-op: the mock has nothing to index or load. Real Moss does this work
    // once at startup (createIndex + loadIndex) so later queries are in-process.
  }

  async getFact(component: string, field: string, vendor?: string): Promise<MossQueryResult> {
    const start = performance.now();
    const fact = findFact(component, field, vendor) ?? null;
    const latencyMs = performance.now() - start;
    return { fact, latencyMs };
  }

  async search(text: string, topK = 3): Promise<MossSearchResult> {
    const start = performance.now();
    const needle = text.toLowerCase().trim();
    const words = needle.split(/\s+/).filter(Boolean);
    const scored = this.facts
      .map((f) => {
        const haystack = f.text.toLowerCase();
        // Whole-phrase match (e.g. the exact vendor name "vendor c") counts far
        // more than loose word overlap — real semantic search would rank an
        // exact entity mention above a generic topical match too.
        const phraseHit = needle.length > 0 && haystack.includes(needle) ? 10 : 0;
        const wordHits = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
        return { fact: f, score: phraseHit + wordHits };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.fact);
    const latencyMs = performance.now() - start;
    return { results: scored, latencyMs };
  }
}

/**
 * Thin wrapper around the real Moss SDK. Loaded dynamically so the app still
 * builds and runs on the mock when the package or credentials aren't present
 * — useful before you've signed up at moss.dev, and for judges who clone the
 * repo without provisioning their own Moss project.
 */
class LiveMossStore implements MossStore {
  readonly backend = "moss" as const;
  private client: any;
  private ready = false;

  constructor(private projectId: string, private projectKey: string) {}

  async init(): Promise<void> {
    if (this.ready) return;
    const mod = await import("@moss-dev/moss").catch(() => null);
    if (!mod) {
      throw new Error(
        "@moss-dev/moss is not installed. Run `npm install @moss-dev/moss`, or unset " +
          "MOSS_PROJECT_ID/MOSS_PROJECT_KEY to fall back to the mock store."
      );
    }
    const MossClient = (mod as any).MossClient ?? (mod as any).default;
    this.client = new MossClient(this.projectId, this.projectKey);

    const docs = POLICY_FACTS.map((f) => ({ id: f.id, text: f.text, metadata: toMossMetadata(f.metadata) }));
    try {
      await this.client.createIndex(INDEX_NAME, docs);
    } catch {
      // Index already exists from a previous run — fine, continue.
    }
    await this.client.loadIndex(INDEX_NAME);
    this.ready = true;
  }

  async getFact(component: string, field: string, vendor?: string): Promise<MossQueryResult> {
    const start = performance.now();
    const searchText = `${field} ${component} ${vendor ?? ""}`.trim();

    // Ask Moss to narrow by field/vendor, but never trust the narrowing alone —
    // verify every candidate's metadata locally before treating it as a match.
    // If the server rejects the filter shape, retry unfiltered over topK and
    // let the local check do all the work.
    let res: { docs: Array<{ id: string; text: string; metadata?: Record<string, string> }> };
    try {
      const filter: Record<string, string> = { field };
      if (vendor) filter.vendor = vendor;
      res = await this.client.query(INDEX_NAME, searchText, { topK: 20, filter });
    } catch {
      res = await this.client.query(INDEX_NAME, searchText, { topK: 20 });
    }

    const match = (res.docs ?? []).find(
      (d) =>
        d.metadata?.field === field &&
        (d.metadata?.component === component || d.metadata?.component === "*") &&
        (!vendor || d.metadata?.vendor === vendor)
    );
    const latencyMs = performance.now() - start;
    return { fact: match ? fromMossDoc(match) : null, latencyMs };
  }

  async search(text: string, topK = 3): Promise<MossSearchResult> {
    const start = performance.now();
    const res = await this.client.query(INDEX_NAME, text, { topK });
    const latencyMs = performance.now() - start;
    return { results: (res.docs ?? []).map(fromMossDoc), latencyMs };
  }
}

let cachedStore: MossStore | null = null;

/** Returns the Moss-backed store when credentials are set, else the mock. */
export async function getMossStore(): Promise<MossStore> {
  if (cachedStore) return cachedStore;

  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_PROJECT_KEY;

  const store: MossStore =
    projectId && projectKey ? new LiveMossStore(projectId, projectKey) : new MockMossStore();

  try {
    await store.init();
    cachedStore = store;
  } catch (err) {
    console.warn(
      `[moss] falling back to mock store: ${(err as Error).message}`
    );
    cachedStore = new MockMossStore();
    await cachedStore.init();
  }

  return cachedStore;
}
