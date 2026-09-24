import type { CSSProperties } from "react";

/*
 * The editions story for the public pages: what is free, what is paid, and what
 * does not exist yet.
 *
 * Server components only. No state, no effects, no fetching, no client directive,
 * so these render on the server and cost nothing at runtime. Only marketing.css
 * classes and its tokens are used; no colour is hardcoded.
 *
 * Every commercial claim below was checked against the repository before it was
 * written. The sources, so a later editor can re-check them rather than guess:
 *
 *   - Apache-2.0, whole repo .......... LICENSE (Apache License 2.0, full text),
 *                                       README.md "Licence" section
 *   - nothing gated behind a paid tier  no billing, plan, price or licence-key
 *                                       code exists under src/agentfox/. The
 *                                       `entitlement.py` module is data-access
 *                                       entitlement (who may see which resource),
 *                                       not payment entitlement.
 *   - runs offline, no API key ........ README.md lines 34-35, and
 *                                       src/agentfox/providers/echo.py
 *   - no telemetry phoning home ....... no AgentFox-owned endpoint appears
 *                                       anywhere in src/agentfox/. The only
 *                                       outbound hosts in config.py are the
 *                                       model and tracing providers the operator
 *                                       configures themselves.
 *   - benchmarks reproducible ......... README.md "Benchmarks, reproducible by
 *                                       anyone", nine scripts under benchmarks/
 *   - stdlib-only verifier ............ src/agentfox/audit/evidence.py
 *                                       VERIFIER_SCRIPT, written into every
 *                                       package as verify_chain.py
 *   - mappings ship labelled DRAFT .... src/agentfox/compliance/catalog.py:214,
 *                                       src/agentfox/compliance/risk.py:369
 *   - cloud does not exist yet ........ README.md line 183: single-org
 *                                       multi-tenancy at the session, "not yet a
 *                                       managed multi-region offering", no live
 *                                       IdP/SSO
 *
 * Deliberately absent: prices, SLA numbers, customer counts, logos. None of them
 * exist, so none of them appear.
 */

const SUPPORT_EMAIL = "support@agentfox.com";

const SUPPORTED_HREF =
  `mailto:${SUPPORT_EMAIL}` +
  "?subject=Supported%20self-hosted%20deployment";

const CLOUD_HREF =
  `mailto:${SUPPORT_EMAIL}` +
  "?subject=Managed%20cloud%20waitlist%20(in%20development)";

const REPO_HREF = "https://github.com/architsharm/guardrails";

const INSTALL_CMD = "pip install git+https://github.com/architsharm/guardrails.git";

/* --- Shared furniture --------------------------------------------------- */

const COLUMN: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const ITEM_BODY: CSSProperties = {
  margin: "5px 0 0",
  fontSize: ".92rem",
  lineHeight: 1.5,
};

const ACTION_FOOT: CSSProperties = {
  marginTop: "auto",
  paddingTop: 4,
  display: "grid",
  gap: 10,
  minWidth: 0,
};

const CODE_BLOCK: CSSProperties = {
  margin: 0,
  padding: "11px 12px",
  background: "var(--mk-surface-2)",
  border: "1px solid var(--mk-border)",
  borderRadius: "var(--mk-r-md)",
  color: "var(--mk-muted)",
  lineHeight: 1.6,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

/** One labelled line inside an edition column. */
function Item({ label, children }: { label: string; children: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span className="mk-label">{label}</span>
      <p className="mk-body" style={ITEM_BODY}>
        {children}
      </p>
    </div>
  );
}

/* --- Editions ----------------------------------------------------------- */

export function Editions() {
  return (
    <section id="editions" className="mk-section">
      <div className="mk-wrap">
        <div className="mk-narrow mk-up" style={{ textAlign: "center" }}>
          <span className="mk-eyebrow">Editions</span>
          <h2 className="mk-h2" style={{ marginTop: 14 }}>
            Free forever, supported, or waiting.
          </h2>
          <p className="mk-lede" style={{ margin: "14px auto 0", maxWidth: "62ch" }}>
            Same software in all three. What you pay for is a support relationship.
          </p>
        </div>

        <div className="mk-grid mk-grid-3" style={{ marginTop: 44 }}>
          {/* 1. Open source */}
          <div className="mk-card mk-up mk-d1" style={COLUMN}>
            <div className="mk-row" style={{ gap: 8 }}>
              <h3 className="mk-h3">Open source</h3>
              <span className="mk-chip mk-chip-go">Available now</span>
            </div>

            <Item label="What you get">
              The whole control plane. Every feature above, none of them gated.
            </Item>
            <Item label="Who it is for">
              Anyone who wants to read the code that decides what their agent may do.
            </Item>
            <Item label="Cost">Free, Apache-2.0. No licence key, no gated features.</Item>

            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
              <pre className="mk-mono" style={CODE_BLOCK}>
                {INSTALL_CMD}
              </pre>
              <p className="mk-fine" style={{ margin: 0 }}>
                The command is <code className="mk-mono">agentfox</code> and the package
                imports as <code className="mk-mono">agentfox</code>.{" "}
                <code className="mk-mono">nometria</code>, the old name, still works.
              </p>
              <a
                className="mk-btn mk-btn-outline"
                href={REPO_HREF}
                target="_blank"
                rel="noreferrer"
                style={{ justifyContent: "center" }}
              >
                Read the repository
              </a>
            </div>
          </div>

          {/* 2. Supported self-hosted */}
          <div className="mk-card mk-up mk-d2" style={COLUMN}>
            <div className="mk-row" style={{ gap: 8 }}>
              <h3 className="mk-h3">Supported self-hosted</h3>
              <span className="mk-chip mk-chip-accent">Available now</span>
            </div>

            <Item label="What you get">
              The identical software, plus help with rollout and priority on fixes.
            </Item>
            <Item label="Who it is for">
              Teams putting this in front of an auditor who want a named person to call.
            </Item>
            <Item label="Cost">
              Talk to us. Not priced yet, and we would rather agree it with the first
              few teams than guess.
            </Item>

            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
              <a
                className="mk-btn mk-btn-primary"
                href={SUPPORTED_HREF}
                style={{ justifyContent: "center" }}
              >
                Email {SUPPORT_EMAIL}
              </a>
            </div>
          </div>

          {/* 3. Managed cloud, in development */}
          <div className="mk-card mk-up mk-d3" style={COLUMN}>
            <div className="mk-row" style={{ gap: 8 }}>
              <h3 className="mk-h3">Managed cloud (in development)</h3>
              <span className="mk-chip mk-chip-hold">In development</span>
            </div>

            <Item label="What you get">
              Nothing yet. It is in development and you cannot sign up today.
            </Item>
            <Item label="Who it is for">
              Teams who would rather not run it themselves, once it exists.
            </Item>
            <Item label="Cost">
              Nothing is priced, because nothing is running.
            </Item>

            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
              <a
                className="mk-btn mk-btn-outline"
                href={CLOUD_HREF}
                style={{ justifyContent: "center" }}
              >
                Join the waitlist
              </a>
            </div>
          </div>
        </div>

        {/* The open-source promise, made checkable. */}
        <div className="mk-grid mk-grid-4 mk-up mk-d4" style={{ marginTop: 28 }}>
          {OSS_FACTS.map((f) => (
            <div
              key={f.label}
              className="mk-card"
              style={{ padding: 16, display: "grid", gap: 6, minWidth: 0 }}
            >
              <span className="mk-label">{f.label}</span>
              <p className="mk-body" style={{ margin: 0, fontSize: ".9rem", lineHeight: 1.5 }}>
                {f.body}
              </p>
              <code className="mk-mono" style={{ color: "var(--mk-faint)", overflowWrap: "anywhere" }}>
                {f.where}
              </code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const OSS_FACTS: { label: string; body: string; where: string }[] = [
  {
    label: "Licence",
    body: "Apache-2.0 in full. It stays that way.",
    where: "LICENSE",
  },
  {
    label: "Offline",
    body: "No API key, no downloaded weights.",
    where: "agentfox init && agentfox demo",
  },
  {
    label: "No telemetry",
    body: "Nothing calls an AgentFox server. Outbound hosts are the ones you configure.",
    where: "src/agentfox/config.py",
  },
  {
    label: "Reproducible",
    body: "Every published figure has a script that regenerates it.",
    where: "benchmarks/",
  },
];

/* --- WhyOpen ------------------------------------------------------------ */

const WHY_OPEN: { title: string; body: string }[] = [
  {
    title: "You cannot audit a black box",
    body: "This software decides what your agent is allowed to do. That decision is only worth trusting if you can read the code that makes it.",
  },
  {
    title: "Auditors should not have to trust us",
    body: "Every evidence package carries verify_chain.py, a stdlib-only script that re-derives the hash chain from the exported rows. It runs without us and without our API.",
  },
  {
    title: "The unreviewed parts say so",
    body: "Compliance mappings were produced from framework texts by engineers, not reviewed by counsel. They ship labelled DRAFT rather than being quietly left out.",
  },
];

export function WhyOpen() {
  return (
    <section id="why-open" className="mk-section mk-band">
      <div className="mk-wrap">
        <div className="mk-up" style={{ maxWidth: "34ch" }}>
          <span className="mk-eyebrow">Why open</span>
          <h2 className="mk-h2" style={{ marginTop: 14 }}>
            The core is open, and stays open.
          </h2>
        </div>

        <div className="mk-grid mk-grid-3" style={{ marginTop: 36 }}>
          {WHY_OPEN.map((w, i) => (
            <div
              key={w.title}
              className={`mk-card mk-up mk-d${Math.min(i + 1, 5)}`}
              style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}
            >
              <h3 className="mk-h3">{w.title}</h3>
              <p className="mk-body" style={{ margin: 0, fontSize: ".94rem" }}>
                {w.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
