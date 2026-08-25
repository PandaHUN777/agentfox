import { api } from "@/lib/api";
import { ApiDown, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const TIER_TONE: Record<string, string> = {
  system_of_record: "ok",
  approved: "",
  unverified: "warn",
  external: "bad",
};

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: "system_of_record", label: "Official company data, kept up to date" },
  { value: "approved", label: "Reviewed and approved, but not the master copy" },
  { value: "unverified", label: "Reference material — may be outdated" },
  { value: "external", label: "Someone's personal notes, or an outside source" },
];

const FRESHNESS_OPTIONS: { value: string; label: string }[] = [
  { value: "24", label: "Daily" },
  { value: "168", label: "Weekly" },
  { value: "720", label: "Monthly" },
  { value: "", label: "Rarely / no schedule" },
];

const inputStyle = {
  width: "100%",
  padding: "6px 9px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
} as const;

function AddSourceForm() {
  return (
    <Panel title="Add a source">
      <form action="/api/sources" method="POST" className="body stack">
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Name this source (what your team calls it)
          </label>
          <input type="text" name="key" required placeholder="e.g. price-book, help-center-articles" style={inputStyle} />
        </div>
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            What kind of source is it?
          </label>
          <select name="tier" defaultValue="unverified" style={inputStyle}>
            {TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
              Who owns it? (email)
            </label>
            <input type="email" name="owner" placeholder="finance@yourcompany.com" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
              How often is it updated?
            </label>
            <select name="freshness_sla_hours" defaultValue="" style={inputStyle}>
              {FRESHNESS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <button type="submit" className="btn-primary">Add source</button>
        </div>
      </form>
    </Panel>
  );
}

/**
 * P8 — source authority.
 *
 * The gap our own groundedness scorer is blind to by construction: it checks the
 * answer against the retrieved context and never asks whether that context was
 * authoritative. An answer faithfully grounded in a deprecated wiki page scores 1.0.
 */
export default async function Sources() {
  let sources: any, health: any;
  try {
    [sources, health] = await Promise.all([api("/api/sources"), api("/api/sources/health")]);
  } catch (e: any) {
    return (
      <>
        <h1>Sources</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const counts = sources.counts || {};

  return (
    <>
      <h1>Sources</h1>
      <p className="sub">
        Which of your sources are systems of record, and which are somebody&rsquo;s
        notebook. Groundedness cannot tell the difference — an answer faithfully
        grounded in a deprecated page scores perfectly.
      </p>

      {sources.sources.length === 0 ? (
        <>
          <div className="hero empty" style={{ marginBottom: 20 }}>
            <div className="hero-title">No sources tiered yet</div>
            <p>
              Until a source has a tier, every retrieved chunk is treated as unverified —
              which is the safe default and tells you nothing. Add one below, or import a
              whole corpus at once with <code className="mono">nometria sources import sources.json</code>.
            </p>
          </div>
          <AddSourceForm />
        </>
      ) : (
        <>
          <div className="cards">
            {["system_of_record", "approved", "unverified", "external"].map((tier) => (
              <div key={tier} className={`card ${TIER_TONE[tier]}`}>
                <div className="n">{counts[tier] || 0}</div>
                <div className="l">{tier.replace(/_/g, " ")}</div>
              </div>
            ))}
            <div className={`card ${health.stale?.length ? "warn" : "ok"}`}>
              <div className="n">{health.stale?.length || 0}</div>
              <div className="l">past their freshness SLA</div>
            </div>
          </div>

          {(health.deprecated?.length > 0 || health.unowned?.length > 0) && (
            <div className="note-panel">
              {health.deprecated?.length > 0 && (
                <div>
                  <strong>{health.deprecated.length} deprecated source(s)</strong> still in
                  the index. Every answer grounded in one raises a finding.
                </div>
              )}
              {health.unowned?.length > 0 && (
                <div>
                  <strong>{health.unowned.length} source(s) without an owner.</strong> Nobody
                  is accountable for whether they are still true.
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <AddSourceForm />
          </div>

          <h2>Registered sources</h2>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>tier</th>
                  <th>source</th>
                  <th>owner</th>
                  <th>domain</th>
                  <th>freshness</th>
                </tr>
              </thead>
              <tbody>
                {sources.sources.map((s: any) => (
                  <tr key={s.key}>
                    <td>
                      <span className={`tag ${TIER_TONE[s.tier] || ""}`}>
                        {s.tier.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <span className="mono small">{s.key}</span>
                      {s.deprecated && <span className="tag bad">deprecated</span>}
                    </td>
                    <td className="small">{s.owner || <span className="muted">unowned</span>}</td>
                    <td className="small muted">{s.domain || "—"}</td>
                    <td className="small">
                      {s.freshness_sla_hours ? (
                        <>
                          <span className={`tag ${s.stale ? "warn" : "ok"}`}>
                            {s.stale ? "stale" : "fresh"}
                          </span>
                          <span className="muted"> {s.freshness_sla_hours}h SLA</span>
                        </>
                      ) : (
                        <span className="muted">no SLA</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
