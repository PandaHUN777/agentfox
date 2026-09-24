import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { GrantMock, ChainMock } from "@/components/marketing/mocks";
import {
  PillarGrid,
  DetectorPipeline,
  RedactionMock,
  DiscoveryMock,
  EvalMock,
  RedteamMock,
  CompliancePanel,
} from "@/components/marketing/visuals";

/**
 * The six pillars, and the five feature sections underneath them.
 *
 * The public page used to sell exactly one idea (a capability grant contains a tool
 * call) and hid the rest of the product behind it. These sections are the rest: the
 * detector stack, containment, discovery, evals and red-teaming, and the audit chain
 * with the compliance mapping on top of it.
 *
 * Presentational only. No state, no effects, no fetching, so every export here stays a
 * server component and the landing page keeps rendering with no client bundle.
 *
 * Image-led on purpose. Every section carries either a real product screenshot in the
 * `.mk-frame` chrome or a React visual built from the same tokens, and the prose around
 * it is capped at two sentences so the picture is what a reader actually takes in.
 *
 * Where every fact on this page came from, so a later editor can re-check rather than
 * guess:
 *
 *   - the six pillars and their questions .... README.md "The six pillars"
 *   - detector registrations ................. src/agentfox/guardrails/__init__.py
 *   - INJECTION.* entity types ............... src/agentfox/guardrails/detectors/injection.py
 *   - SECRET.* entity types .................. src/agentfox/guardrails/detectors/secrets.py
 *   - normalisation views .................... src/agentfox/guardrails/normalize.py
 *   - per-detector budget, degrade-not-skip .. src/agentfox/guardrails/pipeline.py
 *   - baseline / tool-containment rule ids ... src/agentfox/policies_data/*.yaml
 *   - capability.* and taint.* verdicts ...... src/agentfox/enforcement.py
 *   - the provenance ladder .................. src/agentfox/guardrails/taint.py, README "Commands"
 *   - impact tiers ........................... dashboard/app/glossary/page.tsx
 *   - static-only scanning, TS/JS pass ....... src/agentfox/discovery.py
 *   - OpenAPI onboarding ..................... src/agentfox/discovery_openapi.py
 *   - local session scanning ................. src/agentfox/session_scan.py
 *   - MCP hygiene finding types .............. src/agentfox/registry/service.py
 *   - scorer keys ............................ src/agentfox/evaluation/scorers.py
 *   - adaptive campaign scope ................ src/agentfox/evaluation/adaptive.py
 *   - chain digests and verify() ............. src/agentfox/audit/chain.py
 *   - computed compliance status ............. src/agentfox/compliance/status.py
 *   - control count and framework keys ....... src/agentfox/compliance_data/controls.yaml
 *   - every CLI command shown ................ README.md "Commands"
 *
 * Figures appear only where README.md or app/benchmark/page.tsx already publishes them,
 * and each one carries a source comment at the point of use.
 *
 * Only marketing.css classes and its --mk-* tokens are used. No colour is hardcoded, so
 * light and dark are both correct with no second palette.
 */

/* --- Shared furniture --------------------------------------------------- */

type Item = { label: string; body: ReactNode };

const BODY: CSSProperties = { margin: 0, fontSize: ".95rem" };

/**
 * One half of a split row.
 *
 * `direction: ltr` is reset here because `Split` flips the container to place the
 * visual in the left column without moving it ahead of the heading in the DOM. See
 * the note on `Split`.
 */
function Half({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} style={{ direction: "ltr", minWidth: 0 }}>
      {children}
    </div>
  );
}

/**
 * The two-column feature row.
 *
 * `flip` puts the visual in the left column on desktop. It is done by reversing the
 * grid's inline direction rather than by reordering the children, because the columns
 * collapse to one below 900px and a section that opens with a picture and only then
 * says what the picture is of is worse on a phone than on a desktop. So the copy is
 * always first in the DOM, and each half resets `direction` for its own contents.
 */
function Split({
  flip = false,
  wide = false,
  children,
}: {
  flip?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={wide ? "mk-split mk-split-wide" : "mk-split"}
      style={flip ? { direction: "rtl" } : undefined}
    >
      {children}
    </div>
  );
}

function Head({
  eyebrow,
  title,
  children,
  center = false,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={center ? "mk-narrow mk-up" : "mk-up"}
      style={{ textAlign: center ? "center" : "left" }}
    >
      <span className="mk-eyebrow">{eyebrow}</span>
      <h2 className="mk-h2" style={{ marginTop: 14, maxWidth: center ? undefined : "20ch" }}>
        {title}
      </h2>
      {children ? (
        <p
          className="mk-body"
          style={{ marginTop: 14, maxWidth: center ? "64ch" : "46ch", marginInline: center ? "auto" : undefined }}
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** Short labelled items: the mono identifier the product actually emits, then one line. */
function Items({ items }: { items: Item[] }) {
  return (
    <div style={{ display: "grid", gap: 13, marginTop: 24, maxWidth: "46ch" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "grid", gap: 3 }}>
          <span className="mk-mono" style={{ color: "var(--mk-accent)", overflowWrap: "anywhere" }}>
            {it.label}
          </span>
          <span className="mk-body" style={{ fontSize: ".92rem" }}>
            {it.body}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A real product screenshot in the same window chrome the React mockups use, so a
 * captured screen and a drawn panel sit on the page as one family.
 *
 * Intrinsic size is the capture size; CSS scales it down, and width/height are present
 * only so the browser reserves the right box before the file arrives.
 */
function Shot({
  src,
  alt,
  title,
  caption,
  h,
}: {
  src: string;
  alt: string;
  title: string;
  caption?: ReactNode;
  /** Capture height. Every shot is 1600 wide; each is clipped to its own content. */
  h: number;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="mk-frame">
        <div className="mk-frame-bar">
          <span className="mk-frame-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="mk-frame-title">{title}</span>
        </div>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={1600}
          height={h}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>
      {caption ? (
        <figcaption className="mk-fine" style={{ marginTop: 10 }}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A secondary row of two visuals under a feature split. */
/**
 * Visuals stacked under a section, each running the full content width.
 *
 * These were two-up until a screenshot of a whole dashboard screen turned out to be
 * illegible at half of 1076px: a picture nobody can read is decoration, not evidence.
 * One per row costs vertical space and buys back the detail that is the reason the
 * screenshot is on the page at all.
 */
function Pair({ children }: { children: ReactNode }) {
  return (
    <div className="mk-grid mk-up mk-d2" style={{ marginTop: 44, gap: 34 }}>
      {children}
    </div>
  );
}

/* --- 1. The six pillars -------------------------------------------------- */

/**
 * The overview. One grid, six cells, and a reader who gives this five seconds should
 * come away knowing the product covers six areas rather than one.
 */
export function Pillars() {
  return (
    <section id="pillars" className="mk-section">
      <div className="mk-wrap">
        <Head eyebrow="The whole product" title="Six pillars, one control plane." center>
          Each pillar answers a question an organisation has to answer about the agents it
          runs. The sections below are those six at work, on real screens.
        </Head>

        <div className="mk-up mk-d2" style={{ marginTop: 44 }}>
          <PillarGrid />
        </div>

        <p
          className="mk-fine mk-up mk-d3"
          style={{ maxWidth: "var(--measure)", margin: "24px auto 0", textAlign: "center" }}
        >
          Pillars 1 to 3 and 5 run on the request itself. Pillars 4 and 6 are what you run
          before you ship and what you show an auditor afterwards.{" "}
          <Link href="/how-it-works">The path one call takes</Link>
        </p>
      </div>
    </section>
  );
}

/* --- 2. Runtime guardrails ----------------------------------------------- */

const GUARDRAIL_ITEMS: Item[] = [
  {
    // Rule ids from src/agentfox/policies_data/baseline.yaml.
    label: "injection.direct · injection.indirect",
    body: "Injection arriving in the user's own message, and injection arriving inside a retrieved document or a tool result. The second fires at a lower confidence, because an instruction has no business being in data.",
  },
  {
    // Entity types from guardrails/detectors/secrets.py and detectors/pii.py.
    label: "secrets.block · pii.outbound_redact",
    body: "API keys, private keys, connection strings and JWTs are refused. Names, addresses and card numbers are masked or tokenised on the way out rather than blocking the answer.",
  },
  {
    // guardrails/normalize.py: views, not one aggressive rewrite; offsets carried.
    label: "normalisation before detection",
    body: "Zero-width characters, homoglyphs, fullwidth text, base64 and percent-encoding are folded into several views of the same input, and every detector reads all of them. A span found in a decoded blob still reports coordinates in the original text.",
  },
  {
    // guardrails/pipeline.py: per-detector timeout, total budget, degrade not skip.
    label: "budget, then degrade rather than skip",
    body: "Detectors run concurrently under a per-detector timeout and a total budget. One that breaches its budget drops to observe and files a finding, because a control that quietly stops running while reporting green is the failure worth designing against.",
  },
];

/**
 * Pillar 3. The honest framing is load-bearing: this is the layer the product trusts
 * least, README.md publishes that, and the copy here must not read as a claim of
 * robustness. Containment is the section that follows for exactly that reason.
 */
export function Guardrails() {
  return (
    <section id="guardrails" className="mk-section">
      <div className="mk-wrap">
        <Split flip wide>
          <Half>
            <Head eyebrow="Pillar 3 · Runtime guardrails" title="Detectors read the text. A policy decides.">
              Prompt injection, PII, secrets, unsafe content and schema breaks are checked on
              input, output, retrieved documents and tool results. Detection is the layer we
              trust least, and the numbers for it are published rather than left out.
            </Head>
            <Items items={GUARDRAIL_ITEMS} />
            <div
              className="mk-card"
              style={{ marginTop: 26, background: "var(--mk-surface-2)", maxWidth: "46ch" }}
            >
              <span className="mk-label">What this layer is worth</span>
              {/* Both figures: README.md, "Where a competitor beats us" and the adaptive
                  benchmark line above it. */}
              <p className="mk-body" style={{ ...BODY, marginTop: 8, fontSize: ".92rem" }}>
                66.7% recall on the held-out injection split, and an attacker allowed to read
                our verdict and try again gets 73% of what we do catch through within 50
                attempts. Treat it as a speed bump that raises attacker cost, never as a
                defence.
              </p>
              <p style={{ marginTop: 10 }}>
                <Link href="/benchmark" className="mk-btn mk-btn-outline" style={{ padding: "8px 14px" }}>
                  The numbers, and where a competitor beats us
                </Link>
              </p>
            </div>
          </Half>

          <Half className="mk-up mk-d2">
            <DetectorPipeline />
          </Half>
        </Split>

        <Pair>
          <RedactionMock />
          <Shot
            src="/shots/findings.webp"
            h={1075}
            alt="The Findings screen in AgentFox, listing problems raised from detector runs with a severity tag, the finding type, the agent it belongs to and when it last occurred."
            title="agentfox · findings"
            caption="A single blocked call is routine enforcement, not a finding. A problem that is severe, persistent or part of a pattern is raised as one and ranked by severity."
          />
        </Pair>
      </div>
    </section>
  );
}

/* --- 3. Containment ------------------------------------------------------ */

const CONTAINMENT_ITEMS: Item[] = [
  {
    // src/agentfox/policies_data/tool-containment.yaml
    label: "taint.irreversible_tool",
    body: "An irreversible tool invoked with arguments that originated in untrusted content stops for a human, whatever the detectors said about the prompt.",
  },
  {
    label: "capability.denied",
    body: "No capability grants this agent the requested tool and action. Anything not granted is refused, so the list of grants is the whole permission surface.",
  },
  {
    label: "capability.constraint_violated",
    body: "The grant exists, and the call exceeded a limit written into it. The product says which of the two refusals this is rather than reporting one denial for both.",
  },
  {
    label: "cascade.reaches_destructive",
    body: "A call that looks harmless and reaches a destructive tool through its declared trigger graph. The check reasons over the path, not the single call.",
  },
];

/**
 * Pillar 2, and the argument the whole product rests on: this is what is left when
 * detection has already failed. The two benchmark figures quoted are the ones measured
 * with every detector switched off, which is a total bypass rather than a simulated miss.
 */
export function Containment() {
  return (
    <section id="containment" className="mk-band">
      <div className="mk-section mk-wrap">
        <Split wide>
          <Half>
            <Head
              eyebrow="Pillar 2 · Containment"
              title="The layer that holds when detection fails."
            >
              Each tool carries a declared impact tier, each agent holds explicit capability
              grants with limits on argument values, and every argument carries the
              provenance of where it came from. A transfer whose recipient came out of a
              retrieved document is refused because of where the value came from, not because
              anything recognised the payload.
            </Head>

            <div style={{ display: "grid", gap: 10, marginTop: 24, maxWidth: "46ch" }}>
              <span className="mk-label">Impact tier, declared per tool</span>
              <div className="mk-row" style={{ gap: 6 }}>
                {/* dashboard/app/glossary/page.tsx, "Impact tier". */}
                <span className="mk-chip mk-chip-go">read</span>
                <span className="mk-chip">write</span>
                <span className="mk-chip mk-chip-hold">high_impact</span>
                <span className="mk-chip mk-chip-stop">irreversible</span>
              </div>
              <span className="mk-label" style={{ marginTop: 6 }}>
                Provenance an argument can carry
              </span>
              <div className="mk-row" style={{ gap: 6 }}>
                {/* README.md "Commands": the --max-taint ladder, worst first at the right. */}
                <span className="mk-chip">none</span>
                <span className="mk-chip">user</span>
                <span className="mk-chip">retrieved</span>
                <span className="mk-chip">tool_result</span>
                <span className="mk-chip">subagent</span>
                <span className="mk-chip">memory</span>
              </div>
            </div>

            <Items items={CONTAINMENT_ITEMS} />

            <div
              className="mk-card"
              style={{ marginTop: 26, background: "var(--mk-surface)", maxWidth: "46ch" }}
            >
              <span className="mk-label">Measured with every detector switched off</span>
              {/* Both rows: README.md, "What we do claim is that the blast radius is
                  bounded when detection fails." */}
              <div className="mk-grid mk-grid-2" style={{ marginTop: 12, gap: 14 }}>
                <div className="mk-stat">
                  <b>8 of 8</b>
                  <span>attacks contained, 4 of 4 legitimate calls still allowed</span>
                </div>
                <div className="mk-stat">
                  <b>42 of 42</b>
                  <span>AgentDojo attacker calls that act, contained, over 617 ground-truth calls</span>
                </div>
              </div>
              <p className="mk-fine" style={{ marginTop: 12 }}>
                Containment is exactly as good as the declarations behind it. A destructive
                tool declared read is not contained by any of this.
              </p>
            </div>
          </Half>

          <Half className="mk-up mk-d2">
            <GrantMock />
          </Half>
        </Split>

        <Pair>
          <Shot
            src="/shots/approvals.webp"
            h={525}
            alt="The Approvals screen in AgentFox, showing tool calls suspended pending a human decision, each with the agent, the tool, the rule that escalated it and approve or deny actions."
            title="agentfox · approvals"
            caption="An escalated call is suspended, not dropped. It waits for a person, and the decision they make is recorded in the same chain as the call."
          />
          <Shot
            src="/shots/policies.webp"
            h={1075}
            alt="The Policies screen in AgentFox, listing the baseline, tool-containment and EU AI Act high-risk packs with the mode each one is in and the rules it contains."
            title="agentfox · policies"
            caption="Three packs ship. baseline and eu-ai-act-high-risk start in observe and record what they would have done. tool-containment enforces from the moment you install."
          />
        </Pair>
      </div>
    </section>
  );
}

/* --- 4. Discovery -------------------------------------------------------- */

const DISCOVERY_ITEMS: Item[] = [
  {
    // README.md "Commands"; behaviour from src/agentfox/discovery.py.
    label: "agentfox check",
    body: "Walks a repository and reports what talks to a model and which of it is ungoverned. Python is parsed, TypeScript and JavaScript are read too, and the report names the languages it actually read.",
  },
  {
    label: "agentfox agents discover",
    body: "Sweeps for shadow agents, drift and identity posture. Anything sending traffic without being registered is raised as a shadow_agent finding, because the problem with an unregistered agent is that nobody is accountable for it.",
  },
  {
    // src/agentfox/registry/service.py raises these types.
    label: "agentfox scan mcp",
    body: "MCP tool hygiene: tool_poisoning in a tool description, an unpinned_server, schema_drift since the last scan.",
  },
  {
    // src/agentfox/discovery_openapi.py and session_scan.py.
    label: "OpenAPI and local sessions",
    body: "A hosted API is onboarded from its OpenAPI document, and only the spec is ever fetched. Local AI coding-assistant sessions are read for structural metadata only, never a prompt and never a tool call's arguments.",
  },
];

/**
 * Pillar 1. The claim that matters here is a negative one: this never imports or runs
 * the code it is pointed at, and a scan that understood none of the files says so
 * rather than reporting an absence of findings. Both are in discovery.py's own docstring.
 */
export function Discovery() {
  return (
    <section id="discovery" className="mk-section">
      <div className="mk-wrap">
        <Split flip wide>
          <Half>
            <Head
              eyebrow="Pillar 1 · Discovery and registry"
              title="Find the agents before you govern them."
            >
              Point it at a repository and it walks the source with a parser, reporting what
              talks to a model and which of it is ungoverned. It never imports or runs your
              code, and a scan that read no file it understands says exactly that instead of
              reporting clean.
            </Head>
            <Items items={DISCOVERY_ITEMS} />
            <p className="mk-fine" style={{ marginTop: 22, maxWidth: "46ch" }}>
              <span className="mk-mono">agentfox quickscan</span> is the zero-config first
              look. Nothing leaves the machine it runs on.
            </p>
          </Half>

          <Half className="mk-up mk-d2">
            <DiscoveryMock />
          </Half>
        </Split>

        <div className="mk-up mk-d2" style={{ marginTop: 44 }}>
          <Shot
            src="/shots/agents.webp"
            h={1075}
            alt="The Agents screen in AgentFox, listing every registered and shadow agent with its owner, risk tier, the tools it holds capability grants for and its current status."
            title="agentfox · agents"
            caption="Every agent, registered or shadow, with an owner against it. An agent with no owner is a finding of its own, and the kill switch on this screen is reversible."
          />
        </div>
      </div>
    </section>
  );
}

/* --- 5. Evaluation and red-teaming --------------------------------------- */

const ASSURANCE_ITEMS: Item[] = [
  {
    // README.md "Test before you trust".
    label: "agentfox eval gate",
    body: "Scores a suite against its latest recorded baseline and exits 1 on a regression, so a build fails rather than a quality drop reaching production quietly.",
  },
  {
    // Scorer keys registered in src/agentfox/evaluation/scorers.py.
    label: "groundedness · safety · tool_trajectory",
    body: "Scorers judge past output after the fact: whether an answer was supported by the context it was given, whether it was safe, whether the agent took the tool path it was meant to. Latency, cost, JSON schema and an LLM judge are registered too.",
  },
  {
    label: "agentfox redteam run",
    body: "Adversarial probes fired at this agent's own capability grants, declared impact tiers and bound policies in enforce mode, mapped to the OWASP LLM Top 10 and MITRE ATLAS.",
  },
  {
    // src/agentfox/evaluation/adaptive.py: offline, deterministic, no model called.
    label: "adaptive campaigns",
    body: "A blocked probe is retried in mutated form, with the mutation picked from why it was blocked. No model is called and no network is touched, so the same campaign at the same seed produces the same mutation program.",
  },
];

/**
 * Pillar 4. adaptive.py is explicit that this is configuration regression testing and a
 * dishonest thing to call adversarial robustness, and it carries a scope statement into
 * every summary so the output cannot be read the second way. The copy here says the same.
 */
export function Assurance() {
  return (
    <section id="assurance" className="mk-band">
      <div className="mk-section mk-wrap">
        <Split wide>
          <Half>
            <Head
              eyebrow="Pillar 4 · Evaluation and reliability"
              title="Test this deployment, not a model in general."
            >
              Eval suites score an agent&rsquo;s answers and gate CI, so a regression fails
              the build. Red-team probes fire at your own agents&rsquo; capability grants and
              policy bindings, and report whether this deployment got weaker than it was last
              time.
            </Head>
            <Items items={ASSURANCE_ITEMS} />
            <div
              className="mk-card"
              style={{ marginTop: 26, background: "var(--mk-surface)", maxWidth: "46ch" }}
            >
              <span className="mk-label">What a campaign result is not</span>
              <p className="mk-body" style={{ ...BODY, marginTop: 8, fontSize: ".92rem" }}>
                A posture delta against the last comparable campaign, not a pass rate and not
                a robustness certificate. The weekly scheduled campaign ships disabled, so a
                deployment opts into it rather than inheriting it.
              </p>
            </div>
          </Half>

          <Half className="mk-up mk-d2">
            <EvalMock />
          </Half>
        </Split>

        <Pair>
          <RedteamMock />
          <Shot
            src="/shots/evals.webp"
            h={1075}
            alt="The Evaluation screen in AgentFox, showing an eval suite run with per-case scores, the scorer that produced each one and the comparison against the suite's recorded baseline."
            title="agentfox · evaluation"
            caption="A suite run, case by case, against the baseline it is being compared to. The same run is what the CI gate reads."
          />
        </Pair>
      </div>
    </section>
  );
}

/* --- 6. Audit, evidence and compliance ----------------------------------- */

const AUDIT_ITEMS: Item[] = [
  {
    // src/agentfox/audit/chain.py.
    label: "agentfox audit verify",
    body: "Re-derives the chain from the first entry and exits 1 if it is broken. Insertion, deletion, reordering and mutation are all detected, because each entry hashes the one before it.",
  },
  {
    label: "agentfox evidence export",
    body: "An auditor package for one agent over a date range, shipping with a stdlib-only verify_chain.py. The auditor re-runs the check themselves rather than taking our word for the record.",
  },
  {
    // src/agentfox/compliance/status.py.
    label: "status computed from telemetry",
    body: "Each control's status comes from the same execution data that drives enforcement, not from a form someone filled in. A control whose evidence source is producing nothing reads not_implemented, because silence is not success.",
  },
  {
    // src/agentfox/compliance_data/controls.yaml mapping keys.
    label: "43 controls, seven frameworks",
    body: "eu-ai-act, nist-ai-rmf, iso-42001, soc2, owasp-llm, owasp-agentic and mitre-atlas. Where a mapping does not cover something, the coverage table says so rather than leaving the gap unmarked.",
  },
];

/**
 * Pillars 5 and 6. They are one section because the compliance claim is only worth
 * anything on top of a record that can be verified without trusting us, and the draft
 * status of the mappings has to travel with them wherever they are shown.
 */
export function Evidence2() {
  return (
    <section id="audit" className="mk-section">
      <div className="mk-wrap">
        <Split flip wide>
          <Half>
            <Head
              eyebrow="Pillars 5 and 6 · Audit and compliance"
              title="A record that shows when it was edited."
            >
              Every decision lands in a hash chain next to a trace of the whole path the call
              took, whether it was allowed or blocked. There is no update or delete path for
              an audit entry anywhere in the codebase.
            </Head>
            <Items items={AUDIT_ITEMS} />
            <div
              className="mk-card"
              style={{ marginTop: 26, background: "var(--mk-surface-2)", maxWidth: "46ch" }}
            >
              <div className="mk-row" style={{ gap: 8 }}>
                <span className="mk-chip mk-chip-hold">Draft mappings</span>
              </div>
              <p className="mk-body" style={{ ...BODY, marginTop: 10, fontSize: ".92rem" }}>
                The framework mappings were produced from framework texts by engineers and
                have not been reviewed by compliance counsel. They ship inside evidence
                packages labelled DRAFT, UNVERIFIED, NOT LEGAL ADVICE rather than being
                quietly left out.
              </p>
            </div>
          </Half>

          <Half className="mk-up mk-d2">
            <ChainMock />
          </Half>
        </Split>

        <Pair>
          <Shot
            src="/shots/traces.webp"
            h={721}
            alt="The Traces screen in AgentFox, listing governed calls with the agent, the surface, the verdict and the effective verdict for each one."
            title="agentfox · traces"
            caption="Every governed call, with the verdict next to the effective verdict, so you can read what enforcing would have cost before you turn it on."
          />
          <Shot
            src="/shots/trace-detail.webp"
            h={1075}
            alt="One trace opened in AgentFox, showing the full execution path of a single call: what was asked, what was retrieved, which rules fired, the tool arguments and the response."
            title="agentfox · trace detail"
            caption="One call, end to end: what was asked, what was retrieved, which rule fired, what the tool was called with, what came back."
          />
        </Pair>

        <Pair>
          <CompliancePanel />
          <Shot
            src="/shots/compliance.webp"
            h={1075}
            alt="The Compliance screen in AgentFox, showing controls grouped by framework with each control's computed status and the telemetry evidence behind it."
            title="agentfox · compliance"
            caption="Controls by framework, each with the evidence that produced its status and a rationale a person can argue with."
          />
        </Pair>
      </div>
    </section>
  );
}
