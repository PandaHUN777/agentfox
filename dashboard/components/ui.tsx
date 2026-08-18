/** Shared presentational pieces. */

export function Stat({
  n,
  label,
  tone,
}: {
  n: React.ReactNode;
  label: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className={`card${tone ? " " + tone : ""}`}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
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
  escalate: "warn",
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

export function ts(value?: string | null) {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19);
}

export function pct(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}
