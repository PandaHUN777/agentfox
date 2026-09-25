import type { CSSProperties } from "react";
import { WaitlistForm } from "@/components/marketing/waitlist";

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

const SUPPORT_EMAIL = "support@nometria.com";

const SUPPORTED_HREF =
  `mailto:${SUPPORT_EMAIL}` +
  "?subject=Supported%20self-hosted%20deployment";

const REPO_HREF = "https://github.com/architsharm/agentfox";

/* --- Shared furniture --------------------------------------------------- */

const COLUMN: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const ITEM_BODY: CSSProperties = {
  margin: "5px 0 0",
  fontSize: "var(--t-small)",
  lineHeight: 1.5,
};

const ACTION_FOOT: CSSProperties = {
  marginTop: "auto",
  paddingTop: 4,
  display: "grid",
  gap: 10,
  minWidth: 0,
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

export function Editions({
  notice,
  error,
}: {
  /** Set by dashboard/app/api/waitlist/route.ts after a form post. */
  notice?: string;
  error?: string;
} = {}) {
  return (
    <section id="editions" className="mk-section">
      <div className="mk-wrap">
        <div className="mk-narrow mk-up">
          <span className="mk-eyebrow">Editions</span>
          <h2 className="mk-h2" style={{ marginTop: 14 }}>
            Free either way. Run it yourself, or let us run it</h2>
          <p className="mk-lede" style={{ marginTop: 14, maxWidth: "62ch" }}>
            The same control plane in all three. Nothing is priced yet and no card is taken anywhere on this site.
          </p>
        </div>

        <div className="mk-grid mk-grid-3" style={{ marginTop: 40 }}>
          {/* 1. Open source */}
          <div className="mk-card mk-up mk-d1" style={COLUMN}>
            <div className="ed-head">
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

            {/* The install block used to sit here. It made this column half again as
                tall as its two neighbours, which pushed their actions into the middle
                of an empty card, and it is already on the page twice: in the hero's
                fine print and in the closing block. */}
            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
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
            <div className="ed-head">
              <h3 className="mk-h3">Supported self-hosted</h3>
              <span className="mk-chip mk-chip-accent">Available now</span>
            </div>

            <Item label="What you get">
              The identical software, plus help with rollout and priority on fixes.
            </Item>
            <Item label="Who it is for">
              Teams putting this in front of an auditor who want a named person to call.
            </Item>
            <Item label="Cost">Talk to us — we will agree a price with you.</Item>

            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
              <a
                className="mk-btn mk-btn-outline"
                href={SUPPORTED_HREF}
                style={{ justifyContent: "center" }}
              >
                Email us
              </a>
            </div>
          </div>

          {/* 3. Hosted.
              This card said "In development" and offered a waitlist, while the nav
              beside it offered "Sign in" and routes/integrations.py provisions a
              brand-new org for any GitHub identity that has never been seen —
              "new GitHub identity and new tenant are the same event", role owner,
              no invite flow and no allowlist. The hosted product has been live and
              open this whole time; the page was the only thing saying otherwise.

              What genuinely does not exist is billing: there is no plan, trial,
              subscription or Stripe code anywhere under src/agentfox. So the card
              cannot say "14 days free" as a description of today, because there is
              no clock and no paywall to be free of — a visitor would reasonably
              read it as losing access on day 15. It says what is true now (free,
              open, no card) and what the 14 days is (the first thing that happens
              when paid plans arrive). */}
          <div className="mk-card mk-up mk-d3" style={COLUMN}>
            <div className="ed-head">
              <h3 className="mk-h3">Hosted</h3>
              <span className="mk-chip mk-chip-go">Free while in preview</span>
            </div>

            <Item label="What you get">
              The same control plane, run by us. Sign in with GitHub and you have a
              workspace of your own in about ten seconds.
            </Item>
            <Item label="Who it is for">
              Teams who want this in front of an auditor without running a database.
            </Item>
            <Item label="Cost">
              Nothing today, and no card. When paid plans arrive your first 14 days on
              one are free, and we will tell you before anything changes.
            </Item>

            <div style={ACTION_FOOT}>
              <span className="mk-label">Start here</span>
              <a className="mk-btn mk-btn-primary" href="/login" style={{ justifyContent: "center" }}>
                Start free
              </a>
            </div>
          </div>
        </div>

        {/* The waitlist is not gone, it is pointed at the thing that is actually
            unknown. Nobody needs to queue for the product — they can sign in — but
            "tell me before you start charging" is a real request, and it is the one
            this form now collects. */}
        <div className="mk-notify mk-up mk-d4">
          {notice ? (
            <p className="wl-done" role="status">
              {notice}
            </p>
          ) : (
            <>
              <div>
                <h3 className="mk-h3">Tell me when pricing is announced</h3>
                <p className="mk-body">
                  One email, before any plan or paywall exists. Not a queue for
                  access — that is open now.
                </p>
                {error ? (
                  <p className="wl-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <WaitlistForm />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The open-source promise with a file next to each line, so a reader can check any
 * of the four rather than take them.
 */
export function OpenSourcePromise() {
  return (
    <section className="mk-section-tight">
      <div className="mk-wrap">
        <div className="mk-grid mk-grid-4 mk-up">
          {OSS_FACTS.map((f) => (
            <div
              key={f.label}
              className="mk-card"
              style={{ padding: 20, display: "grid", gap: 6, minWidth: 0 }}
            >
              <span className="mk-label">{f.label}</span>
              <p className="mk-body" style={{ margin: 0, fontSize: "var(--t-small)", lineHeight: 1.5 }}>
                {f.body}
              </p>
              <code
                className="mk-mono"
                style={{ color: "var(--mk-muted)", overflowWrap: "anywhere" }}
              >
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
            The core is open, and stays open</h2>
        </div>

        <div className="mk-grid mk-grid-3" style={{ marginTop: 36 }}>
          {WHY_OPEN.map((w, i) => (
            <div
              key={w.title}
              className={`mk-card mk-up mk-d${Math.min(i + 1, 5)}`}
              style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}
            >
              <h3 className="mk-h3">{w.title}</h3>
              <p className="mk-body" style={{ margin: 0, fontSize: "var(--t-small)" }}>
                {w.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
