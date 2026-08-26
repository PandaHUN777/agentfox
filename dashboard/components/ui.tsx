/** Shared presentational pieces. */

import Link from "next/link";
import { InfoTip } from "./InfoTip";

export { InfoTip } from "./InfoTip";

/**
 * Every agent has a real display name (e.g. "Payments Operations Agent") — the
 * registry slug (`payments-ops`) is still needed for the URL and for cross-
 * referencing logs, but a non-technical reader shouldn't have to see it as the
 * primary label. Pass the already-fetched agents list so this needs no extra
 * request; falls back to the slug if the agent isn't found in it.
 */
export function AgentLink({
  slug,
  agents,
  className,
}: {
  slug: string;
  agents: { slug: string; name?: string }[];
  className?: string;
}) {
  const name = agents.find((a) => a.slug === slug)?.name;
  return (
    <Link href={`/agents/${slug}`} className={className} title={name ? slug : undefined}>
      {name || slug}
    </Link>
  );
}

export function Stat({
  n,
  label,
  tone,
  hint,
}: {
  n: React.ReactNode;
  label: string;
  tone?: "ok" | "warn" | "bad";
  /** Explains a number whose formula isn't obvious from the label alone — shown as
   * a native tooltip so the card stays compact. */
  hint?: string;
}) {
  return (
    <div className={`card${tone ? " " + tone : ""}`}>
      <div className="n">{n}</div>
      <div className="l">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
    </div>
  );
}

/** A `Stat` that goes somewhere — the number is the summary, the link is where
 * to go to see the rows that make it up. */
export function StatLink({
  n,
  label,
  tone,
  href,
  hint,
}: {
  n: React.ReactNode;
  label: string;
  tone?: "ok" | "warn" | "bad";
  href: string;
  hint?: string;
}) {
  return (
    <Link href={href} className={`card link${tone ? " " + tone : ""}`}>
      <div className="n">{n}</div>
      <div className="l">
        {label}
        {hint && <InfoTip text={hint} />}
      </div>
    </Link>
  );
}

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="head">
        <span>{title}</span>
        {note && <span className="note">{note}</span>}
      </div>
      {children}
    </div>
  );
}

const VERDICT_TONE: Record<string, string> = {
  block: "bad",
  escalate: "escalate",
  redact: "warn",
  mask: "warn",
  tokenize: "warn",
  allow: "ok",
};

export function Verdict({ value }: { value?: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`tag ${VERDICT_TONE[value] || ""}`}>{value}</span>;
}

const STATUS_TONE: Record<string, string> = {
  effective: "ok",
  degraded: "warn",
  failing: "bad",
  not_implemented: "",
  not_applicable: "",
  not_computed: "",
};

export function ControlStatus({ value }: { value: string }) {
  return <span className={`tag ${STATUS_TONE[value] ?? ""}`}>{value.replace(/_/g, " ")}</span>;
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bad",
  high: "bad",
  medium: "warn",
  low: "",
};

export function Severity({ value }: { value: string }) {
  return <span className={`tag ${SEVERITY_TONE[value] ?? ""}`}>{value}</span>;
}

/**
 * A finding's raw `type` ("redteam", "shadow_agent", "mcp_schema_drift", ...) is an
 * internal slug, not a sentence a reader has met before — shown bare, a queue of
 * findings reads as jargon with no way to tell at a glance what kind of problem
 * each row is. This maps every type this product raises to a short plain-English
 * label and, optionally, a one-line "what this means" — falling back to a
 * humanized version of the slug for anything not explicitly listed, so nothing
 * ever renders as raw underscored jargon with zero explanation.
 */
const FINDING_TYPE_INFO: Record<string, { label: string; blurb?: string }> = {
  guardrail_detection: { label: "Guardrail catch", blurb: "A detector caught something in a request or response and it changed the outcome — see the masked excerpt below." },
  redteam: { label: "Security test", blurb: "Simulated attacks got through without being blocked." },
  shadow_agent: { label: "Unregistered agent", blurb: "This agent is sending traffic but was never registered." },
  unowned_agent: { label: "No owner", blurb: "No one is accountable for this agent's decisions." },
  missed_escalation: { label: "Missed hand-off", blurb: "A conversation should have gone to a human and didn't." },
  handoff_sla_breach: { label: "Hand-off overdue", blurb: "A human hand-off has gone unacknowledged past its deadline." },
  incomplete_handoff: { label: "Incomplete hand-off", blurb: "Context the next step needed was missing when work was handed off." },
  false_resolution: { label: "False resolution", blurb: "Marked resolved without actually resolving the user's issue." },
  boundary_breach: { label: "Answered outside its boundary", blurb: "The agent answered beyond the knowledge boundary it declared." },
  budget_breach: { label: "Budget exceeded", blurb: "This agent has exceeded its configured cost or call budget." },
  budget_exhausted: { label: "Budget exhausted", blurb: "This agent has used up its configured cost or call budget." },
  agent_stopped: { label: "Agent stopped", blurb: "Traffic was halted by a kill switch or quarantine." },
  registry_drift: { label: "Registry drift", blurb: "What this agent actually calls no longer matches what it declared." },
  undeclared_mcp_tool: { label: "Undeclared tool use", blurb: "The agent called a tool it never declared using." },
  mcp_schema_drift: { label: "Tool contract changed", blurb: "A tool's schema changed after approval — possible tampering." },
  over_refusal: { label: "Over-refusal", blurb: "The agent is refusing requests it should be able to answer." },
  drift: { label: "Model drift", blurb: "This model's outputs have measurably changed from its baseline." },
  entitlement_disclosure: { label: "Disclosure risk", blurb: "May have disclosed something the requester wasn't entitled to see." },
  aggregation_disclosure: { label: "Disclosure risk", blurb: "Combined otherwise-safe facts into something the requester shouldn't see." },
  inference_disclosure: { label: "Disclosure risk", blurb: "Let the requester infer something they weren't entitled to know." },
  fabricated_citation: { label: "Fabricated citation", blurb: "Cited a source that doesn't say what it claims, or doesn't exist." },
  integrity_error: { label: "Data integrity error", blurb: "A numeric, temporal, or identity error was detected in the output." },
  schema_drift: { label: "Schema drift", blurb: "A data source's structure changed unexpectedly." },
  source_authority: { label: "Untrusted source", blurb: "Used a source below the trust tier this required." },
  source_conflict: { label: "Conflicting sources", blurb: "Two sources disagreed and the conflict wasn't surfaced." },
  tool_poisoning: { label: "Tool poisoning", blurb: "A tool's behavior changed in a way that looks like tampering." },
  unpinned_server: { label: "Unpinned MCP server", blurb: "Not pinned to a known-good version." },
};

export function findingTypeInfo(type: string): { label: string; blurb?: string } {
  return FINDING_TYPE_INFO[type] || { label: type.replace(/_/g, " ") };
}

export function FindingType({ value }: { value: string }) {
  const info = findingTypeInfo(value);
  return <span title={info.blurb}>{info.label}</span>;
}

/**
 * The draft-mapping warning. Rendered next to every compliance claim, deliberately:
 * a product that presents unreviewed regulatory mappings as authoritative fails its
 * first serious audit conversation (Appendix B §B.6).
 */
export function DraftCaveat({ text }: { text?: string }) {
  return (
    <div className="caveat">
      <strong>Framework mappings are DRAFT</strong>
      {text ||
        "These are informed engineering drafts produced from the framework texts. They are not legal advice, have not been reviewed by compliance counsel or a certification body, and are excluded from evidence packages until reviewed."}
    </div>
  );
}

export function Gaps({ gaps }: { gaps: string[] }) {
  if (!gaps?.length) return null;
  return (
    <>
      <h3>Declared gaps — not covered by this product</h3>
      <ul className="small muted" style={{ marginTop: 0 }}>
        {gaps.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="body muted small">{children}</div>
  );
}

export function ApiDown({ error }: { error: string }) {
  return (
    <div className="error">
      <strong>Control-plane API unreachable.</strong>
      <div className="small" style={{ marginTop: 6 }}>
        Start it with <code className="mono">nometria serve</code>, then reload. Set{" "}
        <code className="mono">NOMETRIA_API_URL</code> if it is not on{" "}
        <code className="mono">http://127.0.0.1:8080</code>.
      </div>
      <div className="small mono muted" style={{ marginTop: 8 }}>
        {error}
      </div>
    </div>
  );
}

/**
 * The other half of the not-ok-response story: the server answered fine, it just
 * doesn't have this row. Confusing this with `ApiDown` sends a reader toward
 * "restart the server" for a problem that isn't the server — a stale link, a
 * record that was never created, an id that got typo'd.
 */
export function NotFound({
  what,
  detail,
  back,
}: {
  /** What kind of thing is missing, lowercase — "finding", "trace", "run". */
  what: string;
  detail?: string;
  back?: { href: string; label: string };
}) {
  return (
    <div className="hero empty">
      <div className="hero-title">No such {what}</div>
      <p>
        The control plane is up — it just doesn&rsquo;t have a {what} at this id. The
        link may be stale, or nothing has created one yet.
      </p>
      {detail && <p className="small muted mono">{detail}</p>}
      {back && (
        <p>
          <Link href={back.href}>&larr; {back.label}</Link>
        </p>
      )}
    </div>
  );
}

export function ts(value?: string | null) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19);
}

export function pct(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}
