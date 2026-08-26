export const dynamic = "force-dynamic";

const PILLARS: [string, string][] = [
  ["Pillar 1", "Discovery & Agent Registry — knowing every agent exists"],
  ["Pillar 2", "Identity, Access & Authorization — who/what an agent is, what it can do"],
  ["Pillar 3", "Runtime Guardrails — the detectors that fire on every request"],
  ["Pillar 4", "Evaluation & Reliability — did the agent actually work"],
  ["Pillar 5", "Audit, Observability & Traceability — the tamper-evident record"],
  ["Pillar 6", "Policy & Compliance Management — rules as versioned, reviewable code"],
  ["Pillar 7", "Answerability & Abstention — does it know what it doesn't know"],
  ["Pillar 8", "Provenance & Source Authority — where a claim actually came from"],
  ["Pillar 9", "Action Assurance — is a tool call safe to actually execute"],
  ["Pillar 10", "Entitlement & Disclosure Control — did this user have the right to see that"],
  ["Pillar 11", "Escalation Governance — did a human get pulled in when one should have"],
  ["Pillar 12", "Policy Composition & Lifecycle — simulate before you promote"],
  ["Pillar 13", "Failure Attribution — whose fault, on a multi-agent handoff"],
  ["Pillar 14", "Context & Retrieval Integrity — was the source material any good"],
  ["Pillar 15", "Cost, Reliability & Degradation — what happens under load or budget pressure"],
];

const NOM_PREFIXES: [string, string][] = [
  ["NOM-DSC", "Discovery & Inventory (Pillar 1) — e.g. every agent is registered and owned"],
  ["NOM-IAM", "Identity & Access (Pillar 2) — non-human identity, credential rotation, approvals"],
  ["NOM-RTG", "Runtime Guardrails (Pillar 3) — injection/PII/secrets/safety detection at request time"],
  ["NOM-EVL", "Evaluation & Reliability (Pillar 4) — pre-release testing, drift, red-team posture"],
  ["NOM-AUD", "Audit & Traceability (Pillar 5) — the execution-path record and its integrity chain"],
  ["NOM-GOV", "Governance & Compliance (Pillar 6) — policy-as-code, framework mappings, risk register"],
];

export default function Glossary() {
  return (
    <>
      <h1>Glossary</h1>
      <p className="sub">
        The coding schemes used across Policies, Guardrails, Compliance and Board view,
        decoded once instead of assumed. Every individual control still shows its own
        plain-language objective where it appears — this page is for the naming
        conventions themselves, not a restatement of every control.
      </p>

      <h2>Concepts</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        The coding schemes below are the least of it — these are the words the product
        itself uses that don't explain themselves on first read.
      </p>
      <div className="panel scroll-x">
        <table>
          <thead><tr><th>term</th><th>means</th></tr></thead>
          <tbody>
            <tr>
              <td className="mono small">Detectors / Guardrails</td>
              <td className="small">
                Runtime checks that run on every request as it happens — prompt injection,
                PII, secrets, unsafe content. See <a href="/policies?tab=guardrails">Guardrails</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Policies</td>
              <td className="small">
                The rules that decide what a detector's result actually does — allow,
                block, or escalate. A policy is in <span className="mono">observe</span>{" "}
                mode (records only) or <span className="mono">enforce</span> mode
                (actually blocks) — see <a href="/policies">Policies</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Controls</td>
              <td className="small">
                The compliance framing of the same underlying capabilities — "is this
                actually happening," each one backed by real telemetry rather than a
                self-attested checkbox — see <a href="/compliance">Compliance</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Scorers</td>
              <td className="small">
                Offline judges that grade an agent's past output after the fact —
                accuracy, groundedness, safety — against a batch of test cases or logged
                results. Different from a detector, which runs on live traffic as it
                happens — see <a href="/evals">Evaluation</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Findings</td>
              <td className="small">
                A concrete problem a detector or scorer actually caught, tied to one
                specific call — see <a href="/findings">Findings</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Entitlement</td>
              <td className="small">
                Whether an agent's answer contains only what the specific person asking
                is allowed to see — not just whether the answer is factually true. See{" "}
                <a href="/entitlement">Entitlement</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Escalation</td>
              <td className="small">
                A whole conversation getting handed off to a human — distinct from{" "}
                <strong>Approvals</strong>, which gates one specific tool call, not the
                conversation around it. See <a href="/approvals?tab=escalation">Escalation</a> and{" "}
                <a href="/approvals">Approvals</a>.
              </td>
            </tr>
            <tr>
              <td className="mono small">Provenance</td>
              <td className="small">
                Being able to point to exactly which source document backed a specific
                claim in an agent's answer, and whether that source was authoritative in
                the first place.
              </td>
            </tr>
            <tr>
              <td className="mono small">Knowledge boundary</td>
              <td className="small">
                An explicit declaration of what an agent is and isn't supposed to answer,
                so "I don't know" becomes a detectable, correct outcome instead of the
                agent inventing an answer to something it has no data for.
              </td>
            </tr>
            <tr>
              <td className="mono small">Groundedness</td>
              <td className="small">
                Whether an agent's answer is actually supported by the context it was
                given, rather than invented — a scorer, not a runtime detector.
              </td>
            </tr>
            <tr>
              <td className="mono small">Blast radius</td>
              <td className="small">
                How many other agents, tools or models are reachable from one agent
                within a couple of hops of observed traffic — a rough proxy for how far
                a compromise or a bad decision here could actually spread.
              </td>
            </tr>
            <tr>
              <td className="mono small">Policy hierarchy</td>
              <td className="small">
                Org, team, agent and user-level policies compose together — extending,
                restricting, or (where explicitly allowed) overriding one another —
                rather than needing one giant rule set. The narrowest level that applies
                wins ties.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>P#-# — PRD pillar references</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        This product's build is organized into 15 numbered "pillars," each a distinct
        governance capability. A reference like <span className="mono">P5-1</span> means{" "}
        <em>the first requirement under Pillar 5</em>. You'll see these in control
        cross-references and in status docs, not in the UI copy itself.
      </p>
      <div className="panel scroll-x">
        <table>
          <thead><tr><th>pillar</th><th>covers</th></tr></thead>
          <tbody>
            {PILLARS.map(([n, d]) => (
              <tr key={n}>
                <td className="mono small">{n}</td>
                <td className="small">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>NOM-XXX-## — this product's own control codes</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        Every control on the <a href="/compliance">Compliance</a> page and every rule in a{" "}
        <a href="/policies">policy</a> carries one of these codes — the prefix says which
        pillar it belongs to, the number is just an index within it.
      </p>
      <div className="panel scroll-x">
        <table>
          <thead><tr><th>prefix</th><th>area</th></tr></thead>
          <tbody>
            {NOM_PREFIXES.map(([n, d]) => (
              <tr key={n}>
                <td className="mono small">{n}-##</td>
                <td className="small">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>OWASP LLM Top 10</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        The industry-standard risk list for LLM applications (OWASP Top 10 for LLM
        Applications). A finding or rule tagged <span className="mono">LLM01</span>,{" "}
        <span className="mono">LLM02</span> etc. is mapped to one of these ten categories —
        the two seen most often here are <strong>LLM01 Prompt Injection</strong> and{" "}
        <strong>LLM02 Sensitive Information Disclosure</strong>. Full list at{" "}
        <a href="https://genai.owasp.org/llm-top-10/" target="_blank" rel="noreferrer">
          genai.owasp.org/llm-top-10
        </a>.
      </p>

      <h2>MITRE ATLAS</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        MITRE's adversarial-tactics knowledge base for AI systems (the AI-specific sibling
        of MITRE ATT&amp;CK) — a taxonomy of real attack techniques, e.g. prompt injection or
        data exfiltration, used to tag red-team findings against a shared, external reference
        rather than an invented one. See{" "}
        <a href="https://atlas.mitre.org/" target="_blank" rel="noreferrer">atlas.mitre.org</a>.
      </p>

      <h2>Detector library names</h2>
      <p className="small muted" style={{ maxWidth: "70ch" }}>
        The <a href="/policies?tab=guardrails">Guardrails</a> and <a href="/policies">Policies</a> pages
        name the underlying open-source engine behind each detector, since which library
        caught something is itself useful debugging context:
      </p>
      <div className="panel scroll-x">
        <table>
          <thead><tr><th>library</th><th>used for</th></tr></thead>
          <tbody>
            <tr><td className="mono small">Presidio</td><td className="small">Microsoft's PII detection and anonymization engine</td></tr>
            <tr><td className="mono small">spaCy</td><td className="small">NLP toolkit Presidio uses for entity recognition</td></tr>
            <tr><td className="mono small">Colang / NeMo Guardrails</td><td className="small">NVIDIA's conversational-rail definition language and runtime</td></tr>
            <tr><td className="mono small">Granite Guardian</td><td className="small">IBM's safety-classification model</td></tr>
            <tr><td className="mono small">garak</td><td className="small">Open-source LLM vulnerability scanner (probes used in red-team campaigns)</td></tr>
            <tr><td className="mono small">pyrit</td><td className="small">Microsoft's Python Risk Identification Tool, another red-team probe source</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
