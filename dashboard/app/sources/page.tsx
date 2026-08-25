import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown, InfoTip, Panel } from "@/components/ui";
import { ContextCheck } from "@/components/ContextCheck";

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
    <Panel
      title="Step 1 — Register a source"
      note="just a name and a trust tier — for real validation, connect it below"
    >
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

const VALIDATION_TONE: Record<string, string> = {
  valid: "ok",
  changed: "warn",
  unreachable: "bad",
  not_fetchable: "",
};

const VALIDATION_LABEL: Record<string, string> = {
  valid: "content verified",
  changed: "content changed since last check",
  unreachable: "could not fetch",
  not_fetchable: "not a URL — can't verify",
};

function ValidationStatus({ source }: { source: any }) {
  if (!source.last_validated_at) {
    return <span className="small muted">never checked</span>;
  }
  const tone = VALIDATION_TONE[source.last_validation_status] || "";
  const label = VALIDATION_LABEL[source.last_validation_status] || source.last_validation_status;
  return (
    <span className={`tag ${tone}`} title={`Last checked ${new Date(source.last_validated_at).toLocaleString()}`}>
      {label}
    </span>
  );
}

const CONNECTION_LABEL: Record<string, string> = {
  database: "Database",
  api: "Enterprise API / KB",
};

function ConnectionBadge({ source }: { source: any }) {
  if (!source.connection_kind) {
    return (
      <span className="small muted" title="No connection registered — a plain http(s) key is fetched directly; anything else can't be checked at all.">
        {/^https?:\/\//i.test(source.key) ? "plain URL" : "no connection"}
      </span>
    );
  }
  return <span className="tag">{CONNECTION_LABEL[source.connection_kind] || source.connection_kind}</span>;
}

function ConnectDatabaseForm({ sources }: { sources: any[] }) {
  return (
    <Panel
      title="Step 2 — Connect a database"
      note="the part that actually validates it, instead of trusting a name"
    >
      <form action="/api/sources/connections" method="POST" className="body stack">
        <input type="hidden" name="kind" value="database" />
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Which registered source is this?
          </label>
          <select name="key" required style={inputStyle}>
            <option value="">choose a source…</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>{s.key}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Dialect</label>
            <select name="dialect" defaultValue="postgresql" style={inputStyle}>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="mssql">SQL Server</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Host</label>
            <input type="text" name="host" placeholder="db.internal.yourcompany.com" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Port</label>
            <input type="number" name="port" placeholder="5432" style={inputStyle} />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Database name</label>
            <input type="text" name="database" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Username</label>
            <input type="text" name="username" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" name="credential" autoComplete="new-password" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Table to fingerprint (optional — otherwise every table name is used)
          </label>
          <input type="text" name="check_table" placeholder="customers" style={inputStyle} />
        </div>
        <div>
          <button type="submit" className="btn-primary">Connect database</button>
        </div>
      </form>
    </Panel>
  );
}

function ConnectApiForm({ sources }: { sources: any[] }) {
  return (
    <Panel
      title="Step 2 — Connect a knowledge base or API"
      note="Confluence, SharePoint, Notion and similar are all an authenticated REST endpoint under the hood"
    >
      <form action="/api/sources/connections" method="POST" className="body stack">
        <input type="hidden" name="kind" value="api" />
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Which registered source is this?
          </label>
          <select name="key" required style={inputStyle}>
            <option value="">choose a source…</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>{s.key}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            API URL to check (a page, space, or search endpoint that returns its content)
          </label>
          <input
            type="url" name="base_url" required
            placeholder="https://yourteam.atlassian.net/wiki/rest/api/content/12345"
            style={inputStyle}
          />
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Auth header name</label>
            <input type="text" name="auth_header" defaultValue="Authorization" style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>Prefix (if any)</label>
            <input type="text" name="auth_prefix" defaultValue="Bearer " style={inputStyle} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label className="small muted" style={{ display: "block", marginBottom: 4 }}>API token</label>
            <input type="password" name="credential" autoComplete="new-password" style={inputStyle} />
          </div>
        </div>
        <div>
          <button type="submit" className="btn-primary">Connect API</button>
        </div>
      </form>
    </Panel>
  );
}

function EditSourceForm({ source }: { source: any }) {
  return (
    <details>
      <summary className="small">Edit</summary>
      <form
        action="/api/sources"
        method="POST"
        className="stack"
        style={{ marginTop: 8, minWidth: 240 }}
      >
        <input type="hidden" name="key" value={source.key} />
        <label className="small muted" style={{ display: "block" }}>
          Tier
          <select name="tier" defaultValue={source.tier} style={inputStyle}>
            {TIER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="small muted" style={{ display: "block" }}>
          Owner (email)
          <input type="email" name="owner" defaultValue={source.owner || ""} style={inputStyle} />
        </label>
        <label className="small muted" style={{ display: "block" }}>
          Domain / corpus
          <input type="text" name="domain" defaultValue={source.domain || ""} style={inputStyle} />
        </label>
        <label className="small muted" style={{ display: "block" }}>
          Freshness SLA
          <select
            name="freshness_sla_hours"
            defaultValue={source.freshness_sla_hours ? String(source.freshness_sla_hours) : ""}
            style={inputStyle}
          >
            {FRESHNESS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {source.deprecated && (
          <label className="small muted" style={{ display: "block" }}>
            Status
            <select name="deprecated" defaultValue="true" style={inputStyle}>
              <option value="true">Stay deprecated</option>
              <option value="false">Un-deprecate — bring back into rotation</option>
            </select>
          </label>
        )}
        <button type="submit" className="btn-primary" style={{ fontSize: 12 }}>
          Save
        </button>
      </form>
    </details>
  );
}

/**
 * P8 — source authority.
 *
 * The gap our own groundedness scorer is blind to by construction: it checks the
 * answer against the retrieved context and never asks whether that context was
 * authoritative. An answer faithfully grounded in a deprecated wiki page scores 1.0.
 */
export default async function Sources({
  searchParams,
}: {
  searchParams: Promise<{ review_error?: string; review_notice?: string }>;
}) {
  const { review_error, review_notice } = await searchParams;
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
        grounded in a deprecated page scores perfectly. A stale, deprecated, or
        off-domain source raises a <Link href="/findings">finding</Link> the next
        time an <Link href="/agents">agent</Link> is grounded in it. Most enterprise
        agents pull from more than a website — connect a database or an internal
        knowledge base below so validation can check the real thing, not just a name.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      {sources.sources.length === 0 ? (
        <>
          <div className="hero empty" style={{ marginBottom: 20 }}>
            <div className="hero-title">No sources tiered yet</div>
            <p>
              Until a source has a tier, every retrieved chunk is treated as unverified —
              which is the safe default and tells you nothing. Register one below (just a
              name and a trust tier), then come back to actually connect it to a real
              database or API — that's step 2, and it's what turns this from a claim into
              a checked fact. Or import a whole corpus at once with{" "}
              <code className="mono">nometria sources import sources.json</code>.
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

          <div className="grid2" style={{ marginBottom: 20 }}>
            <ConnectDatabaseForm sources={sources.sources} />
            <ConnectApiForm sources={sources.sources} />
          </div>

          <h2>Registered sources</h2>
          <p className="sub" style={{ marginTop: -8 }}>
            A tier is a person&rsquo;s claim about a source. &ldquo;Validate&rdquo; is us
            actually fetching it and checking the content is still what it was — a
            registered key is not proof anything real backs it.
          </p>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>tier</th>
                  <th>source</th>
                  <th>
                    connection
                    <InfoTip text="How this source is actually reached for validation — a database or an authenticated API, not just a name. A plain http(s) key is fetched directly with no connection needed." />
                  </th>
                  <th>owner</th>
                  <th>domain</th>
                  <th>freshness</th>
                  <th>
                    content check
                    <InfoTip text="Only http(s) source keys, or sources with a registered connection, can be checked. A bare table name or document id with no connection has nothing to check against, and is reported as 'not a URL' rather than silently passing." />
                  </th>
                  <th>actions</th>
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
                      {s.is_seed && (
                        <span
                          className="tag"
                          title="Created by `nometria seed` for demo purposes — not a real registration."
                        >
                          sample data
                        </span>
                      )}
                    </td>
                    <td className="small">
                      <ConnectionBadge source={s} />
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
                    <td className="small">
                      <ValidationStatus source={s} />
                    </td>
                    <td className="small">
                      <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <EditSourceForm source={s} />
                        <form action="/api/sources/validate" method="POST">
                          <input type="hidden" name="key" value={s.key} />
                          <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "3px 8px" }}>
                            Validate
                          </button>
                        </form>
                        {!s.deprecated ? (
                          <form action="/api/sources/deprecate" method="POST">
                            <input type="hidden" name="key" value={s.key} />
                            <button type="submit" className="btn-reject" style={{ fontSize: 12, padding: "3px 8px" }}>
                              Deprecate
                            </button>
                          </form>
                        ) : (
                          <form action="/api/sources/delete" method="POST">
                            <input type="hidden" name="key" value={s.key} />
                            <button
                              type="submit"
                              className="btn-reject"
                              style={{ fontSize: 12, padding: "3px 8px" }}
                              title="Permanently removes the record. Unlike deprecating, this drops the 'do not trust' signal — an answer grounded in it afterward looks unverified, not flagged."
                            >
                              Delete
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>
        Check ingestion quality
        <InfoTip text="A source can be perfectly authoritative and still fail an agent because of how it was extracted or chunked — a lost space glyph glues words together, a PDF-to-text pass leaves mojibake, a chunk boundary cuts a claim's exception onto the wrong side. This is P14: a dry run against real text before it becomes context, distinct from P8's tiering above." />
      </h2>
      <p className="sub">
        Not tied to a registered source — paste what a loader actually extracted, or
        what would reach the retriever as chunks, and see the same checks a governed
        ingestion pipeline would run.
      </p>
      <ContextCheck />
    </>
  );
}
