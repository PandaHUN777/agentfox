"use client";

import { useState } from "react";

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

const CONDITION_OPTIONS: { value: string; prefix: string; label: string; defaultReason: string }[] = [
  {
    value: "injection",
    prefix: "INJECTION",
    label: "Someone tries to override the agent's instructions, or jailbreak it",
    defaultReason: "Prompt-injection or jailbreak attempt detected.",
  },
  {
    value: "pii",
    prefix: "PII",
    label: "The content contains personal information (names, emails, SSNs, phone numbers…)",
    defaultReason: "Personal information detected.",
  },
  {
    value: "secret",
    prefix: "SECRET",
    label: "The content contains a password, API key, or other secret",
    defaultReason: "A secret or credential was detected.",
  },
  {
    value: "unsafe",
    prefix: "SAFETY",
    label: "The content looks unsafe or harmful",
    defaultReason: "Unsafe or harmful content detected.",
  },
  {
    value: "malformed",
    prefix: "SCHEMA",
    label: "The agent's output doesn't match the format it's supposed to",
    defaultReason: "Output did not match the expected schema.",
  },
];

const CONFIDENCE_OPTIONS = [
  { value: "0.85", label: "Only when very confident (fewer false alarms, may miss some)" },
  { value: "0.7", label: "Balanced (recommended)" },
  { value: "0.5", label: "Catch as much as possible (more false alarms)" },
];

const SURFACE_OPTIONS = [
  { value: "input", label: "What the user sends in" },
  { value: "output", label: "What the agent sends back" },
  { value: "retrieved", label: "Information the agent looks up" },
  { value: "tool_args", label: "What the agent sends to a tool" },
  { value: "tool_result", label: "What a tool sends back to the agent" },
];

const EFFECT_OPTIONS = [
  { value: "block", label: "Block it completely" },
  { value: "redact", label: "Redact just the sensitive part, then continue" },
  { value: "mask", label: "Hide it behind a placeholder, then continue" },
  { value: "escalate", label: "Ask a human before continuing" },
  { value: "abstain", label: "Have the agent decline to answer" },
  { value: "allow", label: "Just log it — don't stop anything" },
];

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Serious — flag as critical" },
  { value: "high", label: "Flag as high" },
  { value: "medium", label: "Flag as medium" },
  { value: "low", label: "Just for the record — flag as low" },
];

function yamlQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildRuleYaml(opts: {
  conditionValue: string;
  confidence: string;
  surfaces: string[];
  effect: string;
  severity: string;
  reason: string;
}): string {
  const condition = CONDITION_OPTIONS.find((c) => c.value === opts.conditionValue) || CONDITION_OPTIONS[0];
  const id = `custom.${condition.value}.${Date.now().toString(36).slice(-5)}`;
  const surfaces = opts.surfaces.length ? opts.surfaces : ["input", "output"];
  const lines = [
    `  - id: ${id}`,
    `    description: ${yamlQuote(condition.label)}`,
    `    when:`,
    `      surface: [${surfaces.join(", ")}]`,
    `      detection: {entity_prefix: ${condition.prefix}, min_score: ${opts.confidence}}`,
    `    effect: ${opts.effect}`,
    `    severity: ${opts.severity}`,
    `    reason: ${yamlQuote(opts.reason || condition.defaultReason)}`,
  ];
  return lines.join("\n");
}

/** Splices a generated rule block into the policy YAML text without a full YAML
 * parser: handles the one place a rule can go (right after the top-level `rules:`
 * key), whether that key currently holds `[]` or a real list. */
function insertRuleIntoYaml(body: string, ruleBlock: string): string {
  const flowEmpty = /^rules:\s*\[\s*\]\s*$/m;
  if (flowEmpty.test(body)) {
    return body.replace(flowEmpty, `rules:\n${ruleBlock}`);
  }
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => /^rules:\s*$/.test(l));
  if (idx !== -1) {
    lines.splice(idx + 1, 0, ...ruleBlock.split("\n"));
    return lines.join("\n");
  }
  return `${body}\nrules:\n${ruleBlock}\n`;
}

function RuleBuilder({ onAdd }: { onAdd: (yaml: string) => void }) {
  const [conditionValue, setConditionValue] = useState(CONDITION_OPTIONS[0].value);
  const [confidence, setConfidence] = useState(CONFIDENCE_OPTIONS[1].value);
  const [surfaces, setSurfaces] = useState<string[]>(["input", "output"]);
  const [effect, setEffect] = useState("block");
  const [severity, setSeverity] = useState("high");
  const [reason, setReason] = useState("");
  const [justAdded, setJustAdded] = useState(false);

  function toggleSurface(value: string) {
    setSurfaces((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]));
  }

  function add() {
    const yaml = buildRuleYaml({ conditionValue, confidence, surfaces, effect, severity, reason });
    onAdd(yaml);
    setJustAdded(true);
    setReason("");
    setTimeout(() => setJustAdded(false), 4000);
  }

  return (
    <div className="stack">
      <div>
        <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
          When this happens
        </label>
        <select value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} style={inputStyle}>
          {CONDITION_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
          How confident should we be before acting
        </label>
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={inputStyle}>
          {CONFIDENCE_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
          Where should we check (pick at least one)
        </label>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {SURFACE_OPTIONS.map((s) => (
            <label key={s.value} className="small" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <input type="checkbox" checked={surfaces.includes(s.value)} onChange={() => toggleSurface(s.value)} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
          Then do this
        </label>
        <select value={effect} onChange={(e) => setEffect(e.target.value)} style={inputStyle}>
          {EFFECT_OPTIONS.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            How serious is this
          </label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={inputStyle}>
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 2, minWidth: 240 }}>
          <label className="small muted" style={{ display: "block", marginBottom: 4 }}>
            Note for your team (why this rule exists)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={CONDITION_OPTIONS.find((c) => c.value === conditionValue)?.defaultReason}
            style={inputStyle}
          />
        </div>
      </div>

      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <button type="button" className="btn-approve" onClick={add} disabled={surfaces.length === 0}>
          Add this rule
        </button>
        {justAdded && <span className="small" style={{ color: "var(--ok)" }}>Added below — click Validate, then Save new version to make it real.</span>}
      </div>
    </div>
  );
}

/**
 * The policy engine accepts a full declarative YAML document (POST /api/policies
 * validates it with the same Pydantic model that compiles it to Rego) — a real,
 * versioned authoring surface. But a raw YAML textarea as the *only* way to add a
 * rule meant nobody without engineering background could configure protection at
 * all. The rule builder above generates that YAML from plain-language choices and
 * splices it in; the textarea itself stays available (every choice compiles down
 * to it, nothing is hidden from someone who wants to read or hand-edit it) but
 * collapsed behind an explicit "for engineers" toggle by default for a policy that
 * has nothing real saved yet.
 */
export function PolicyEditor({
  policyKey,
  initialBody,
  canEnforce,
  isTemplate,
}: {
  policyKey: string;
  initialBody: string;
  canEnforce: boolean;
  /** True when `initialBody` is a suggested starting point we generated, not what
   * is actually saved — the "rules" count shown elsewhere reflects the real saved
   * version and will legitimately read 0 until this is edited and saved. */
  isTemplate?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [validation, setValidation] = useState<any>(null);
  const [saveResult, setSaveResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedTemplate, setDismissedTemplate] = useState(false);

  async function validate() {
    setBusy(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/policies/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setValidation(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/policies/${policyKey}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, notes: "edited from the dashboard" }),
      });
      const json = await res.json();
      setSaveResult({ ok: res.ok, ...json });
      if (res.ok) {
        setValidation(null);
        setTimeout(() => window.location.reload(), 900);
      }
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: "observe" | "enforce") {
    if (
      mode === "enforce" &&
      !window.confirm(
        "This will start actually blocking real traffic that matches this policy's rules, starting now. Are you sure?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/policies/${policyKey}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) window.location.reload();
      else setSaveResult({ ok: false, detail: (await res.json()).detail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {isTemplate && !dismissedTemplate && (
        <div className="template-banner">
          <strong>Nothing is saved yet.</strong> Add a rule below, then click{" "}
          <em>Save new version</em> to make it real, or{" "}
          <button
            type="button"
            onClick={() => setDismissedTemplate(true)}
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, font: "inherit" }}
          >
            dismiss
          </button>
          .
        </div>
      )}

      <RuleBuilder onAdd={(yaml) => setBody((b) => insertRuleIntoYaml(b, yaml))} />

      <details open={!isTemplate}>
        <summary className="small muted" style={{ cursor: "pointer", marginBottom: 8 }}>
          View or edit the underlying rule code (for engineers) — every choice above compiles down to this
        </summary>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          rows={Math.max(16, body.split("\n").length + 2)}
          style={{
            width: "100%",
            fontFamily: "var(--mono)",
            fontSize: 12.5,
            lineHeight: 1.5,
            padding: 14,
            borderRadius: 7,
            border: "1px solid var(--border)",
            background: "var(--panel-2)",
            color: "var(--text)",
            resize: "vertical",
          }}
        />
      </details>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn-scan" onClick={validate} disabled={busy}>
          Validate
        </button>
        <button type="button" className="btn-approve" onClick={save} disabled={busy}>
          Save new version
        </button>
        {canEnforce && (
          <>
            <button type="button" className="btn-scan" onClick={() => setMode("observe")} disabled={busy}>
              Set observe
            </button>
            <button type="button" className="btn-reject" onClick={() => setMode("enforce")} disabled={busy}>
              Promote to enforce
            </button>
          </>
        )}
      </div>

      {validation && (
        <div className={validation.valid ? "note-panel" : "error"}>
          {validation.valid ? (
            <>
              <strong>Valid</strong> — {validation.rules} rule(s), mode {validation.mode}, controls:{" "}
              {validation.controls?.length ? validation.controls.join(", ") : "none declared"}
            </>
          ) : (
            <>
              <strong>Invalid</strong> — {validation.error}
            </>
          )}
        </div>
      )}
      {saveResult && (
        <div className={saveResult.ok ? "note-panel" : "error"}>
          {saveResult.ok ? (
            <>
              <strong>Saved</strong> — version {saveResult.version}. Reloading…
            </>
          ) : (
            <>
              <strong>Save failed</strong> — {saveResult.detail || "unknown error"}
            </>
          )}
        </div>
      )}
    </div>
  );
}
