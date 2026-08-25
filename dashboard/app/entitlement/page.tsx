import { api } from "@/lib/api";
import { ApiDown, Empty, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const CLASS_OPTIONS: { value: string; label: string }[] = [
  { value: "pii_sensitive", label: "Sensitive personal data" },
  { value: "mnpi", label: "Insider financial information" },
  { value: "legal_hold", label: "Under legal hold" },
  { value: "blackout", label: "Blackout-period restricted" },
  { value: "insider", label: "Insider-only" },
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

/**
 * P10 — the highest commercial-value gap, and the reason Copilot-class rollouts stall.
 *
 * The number this page exists for is over-permission: how much more the agent can
 * reach than its callers are entitled to. It is meaningful before any entitlement
 * model exists, which is the argument for looking at it first.
 */
export default async function Entitlement() {
  let report: any, principals: any, grants: any;
  try {
    [report, principals, grants] = await Promise.all([
      api("/api/entitlement/over-permission"),
      api("/api/entitlement/principals"),
      api("/api/entitlement/grants"),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Entitlement</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const ratio = report.over_permission;

  return (
    <>
      <h1>Entitlement</h1>
      <p className="sub">
        Whether answers contain only what the person asking may see. Every permission
        check can pass and the answer still overshare — the agent runs under its own
        identity and inherits everything that identity can reach.
      </p>

      {report.requests === 0 ? (
        <div className="hero empty">
          <div className="hero-title">Nobody is being checked yet</div>
          <p>{report.note}</p>
          <p className="small muted">
            Add a person or team and a grant below to get started — this number fills in
            automatically once real requests are being filtered.
          </p>
          <p className="small muted">
            Filtering happens through <code className="mono">POST /api/entitlement/filter</code> before
            generation. Filtering afterwards means the answer already contains what it
            should not.
          </p>
        </div>
      ) : (
        <>
          <div className="cards">
            <div className={`card ${ratio > 0.2 ? "bad" : ratio ? "warn" : "ok"}`}>
              <div className="n">{(ratio * 100).toFixed(1)}%</div>
              <div className="l">of retrieved content withheld</div>
            </div>
            <div className="card">
              <div className="n">{report.requests}</div>
              <div className="l">decisions ({report.window_days}d)</div>
            </div>
            <div className="card">
              <div className="n">{report.principals}</div>
              <div className="l">distinct callers</div>
            </div>
            <div className="card">
              <div className="n">{report.candidates}</div>
              <div className="l">chunks considered</div>
            </div>
          </div>

          <div className="note-panel">
            <strong>That share is not an error rate.</strong> It is what the agent could
            reach and the caller could not — the oversharing number. A high figure with
            few grants configured usually means the entitlement model is missing, not
            that the filter is wrong.
          </div>

          <h2>Why content was withheld</h2>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>reason</th>
                  <th>chunks</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.reasons || {}).map(([reason, count]: [string, any]) => (
                  <tr key={reason}>
                    <td className="mono">{reason.replace(/_/g, " ")}</td>
                    <td className="mono small">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Callers</h2>
      <div className="panel">
        {principals.principals?.length ? (
          <table>
            <thead>
              <tr>
                <th>subject</th>
                <th>groups</th>
                <th>clearances</th>
                <th>residency</th>
              </tr>
            </thead>
            <tbody>
              {principals.principals.map((p: any) => (
                <tr key={p.subject}>
                  <td className="mono small">{p.subject}</td>
                  <td className="small">{p.groups?.join(", ") || <span className="muted">—</span>}</td>
                  <td className="small">
                    {p.clearances?.length ? (
                      p.clearances.map((c: string) => (
                        <span key={c} className="tag warn">
                          {c}
                        </span>
                      ))
                    ) : (
                      <span className="muted">none</span>
                    )}
                  </td>
                  <td className="small muted">{p.residency || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>
            No principals registered. Until one is, the agent answers with no idea who is
            asking.
          </Empty>
        )}
      </div>

      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <Panel title="Add a person or group">
          <form action="/api/entitlement/principals" method="POST" className="body stack">
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                Email or team name
              </label>
              <input type="text" name="subject" required placeholder="alice@yourcompany.com" style={inputStyle} />
            </div>
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                Display name (optional)
              </label>
              <input type="text" name="display" placeholder="Alice from Support" style={inputStyle} />
            </div>
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                Teams they belong to (comma-separated)
              </label>
              <input type="text" name="groups" placeholder="support-team, all-staff" style={inputStyle} />
            </div>
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                Sensitive categories they're cleared to see (comma-separated, leave blank if none)
              </label>
              <input type="text" name="clearances" placeholder="pii_sensitive" style={inputStyle} />
            </div>
            <div>
              <button type="submit" className="btn-primary">Add person or group</button>
            </div>
          </form>
        </Panel>
      </div>

      <h2>Grants</h2>
      <p className="sub">
        Default-deny: a resource with no grant is invisible. A grant does not open a
        restricted class — that needs a matching clearance.
      </p>
      <div className="panel">
        {grants.grants?.length ? (
          <table>
            <thead>
              <tr>
                <th>resource</th>
                <th>principal</th>
                <th>classes</th>
                <th>purposes</th>
              </tr>
            </thead>
            <tbody>
              {grants.grants.map((g: any) => (
                <tr key={g.id}>
                  <td className="mono small">{g.resource}</td>
                  <td className="small">
                    {g.principal}
                    <span className="tag">{g.principal_kind}</span>
                  </td>
                  <td className="small">
                    {g.classes?.map((c: string) => (
                      <span key={c} className="tag warn">
                        {c}
                      </span>
                    )) || <span className="muted">—</span>}
                  </td>
                  <td className="small muted">{g.purposes?.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No grants. Every resource is currently invisible to every caller.</Empty>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Add a grant" note="give a person or team access to a source">
          <form action="/api/entitlement/grants" method="POST" className="body stack">
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                  Which source can they see?
                </label>
                <input type="text" name="resource" required placeholder="price-book" style={inputStyle} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                  Person or team (must match a name above)
                </label>
                <input type="text" name="principal" required placeholder="support-team" style={inputStyle} />
              </div>
            </div>
            <input type="hidden" name="principal_kind" value="group" />
            <div>
              <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
                Only needed if the source contains sensitive data (they still need a matching clearance above)
              </label>
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                {CLASS_OPTIONS.map((c) => (
                  <label key={c.value} className="small" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <input type="checkbox" name="classes" value={c.value} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <button type="submit" className="btn-primary">Add grant</button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
