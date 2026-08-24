import { api, safeApi } from "@/lib/api";
import { ApiDown, Panel, ts } from "@/components/ui";
import { PolicyEditor } from "@/components/PolicyEditor";

export const dynamic = "force-dynamic";

function starterTemplate(key: string, name: string, description: string): string {
  return `# ${name || key} — starts empty; here's a real rule to build from.
key: ${key}
name: ${name || key}
description: ${description || ""}
version: 1
mode: observe
default_effect: allow
fail_mode: open
scope:
  agents: ["*"]

rules:
  - id: injection.direct
    description: Block high-confidence prompt injection or jailbreak in user input.
    when:
      surface: [input]
      detection: {entity_prefix: INJECTION, min_score: 0.85}
    effect: block
    severity: high
    reason: "Prompt-injection or jailbreak attempt detected in user input."
    controls: [NOM-RTG-01]
`;
}

export default async function PolicyDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let policy: any, bindings: any;
  try {
    [policy, bindings] = await Promise.all([
      api(`/api/policies/${key}`),
      safeApi("/api/policies", { policies: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Policy</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const binding = bindings.policies?.find((p: any) => p.key === key);
  const body = policy.body?.trim()
    ? policy.body
    : starterTemplate(key, policy.name, policy.description);

  return (
    <>
      <h1>{policy.name || key}</h1>
      <p className="sub">{policy.description || "No description."}</p>

      <div className="row small" style={{ gap: 16, marginBottom: 16 }}>
        <span>
          <span className="muted">mode </span>
          <span className={`tag ${binding?.mode === "enforce" ? "ok" : "warn"}`}>
            {binding?.mode || "unbound"}
          </span>
        </span>
        <span>
          <span className="muted">rules </span>
          <span className="mono">{binding?.rules ?? 0}</span>
        </span>
      </div>

      <h2>Rules — authored as YAML, compiled to Rego</h2>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 14, maxWidth: "70ch" }}>
        Edit and validate before saving — validation runs the same Pydantic model the
        engine compiles at enforcement time, so an error here is an error there.
        Saving creates a new immutable version; nothing currently in force changes
        until you promote it.
      </p>
      <PolicyEditor policyKey={key} initialBody={body} canEnforce={true} />

      {policy.versions?.length > 0 && (
        <>
          <h2>Version history</h2>
          <div className="panel scroll-x">
            <table>
              <thead>
                <tr><th className="num">version</th><th>author</th><th>notes</th><th className="num">rules</th><th>when</th></tr>
              </thead>
              <tbody>
                {[...policy.versions].reverse().map((v: any) => (
                  <tr key={v.id}>
                    <td className="num small">{v.version}</td>
                    <td className="small muted">{v.author}</td>
                    <td className="small wrap muted">{v.notes || "—"}</td>
                    <td className="num small">{v.rules}</td>
                    <td className="small muted">{ts(v.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {policy.compiled?.rules?.length > 0 && (
        <>
          <h2>Compiled — what actually evaluates</h2>
          <Panel title="Compiled rules">
            <pre className="small" style={{ margin: 0, padding: 14 }}>
              {JSON.stringify(policy.compiled.rules, null, 2)}
            </pre>
          </Panel>
        </>
      )}
    </>
  );
}
