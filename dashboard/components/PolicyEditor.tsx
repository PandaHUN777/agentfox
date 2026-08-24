"use client";

import { useState } from "react";

/**
 * The policy engine already accepts a full declarative YAML document
 * (POST /api/policies validates it with the same Pydantic model that compiles it
 * to Rego) — that's a stronger authoring surface than a form over ~20 condition
 * fields would be, and it matches what this product argues for itself: "governance
 * rules exist as versioned, reviewable code" (NOM-GOV-01). So this is a YAML editor
 * with live validation, not a condition-builder — scan-proposed policies start as an
 * empty shell with no rules and no way to see what one looks like; this fixes both.
 */
export function PolicyEditor({
  policyKey,
  initialBody,
  canEnforce,
}: {
  policyKey: string;
  initialBody: string;
  canEnforce: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [validation, setValidation] = useState<any>(null);
  const [saveResult, setSaveResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

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
