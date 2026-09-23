import { api, safeApi, ApiError, apiErrorProps } from "@/lib/api";
import { ApiDown, Panel, ts } from "@/components/ui";
import { PolicyEditor } from "@/components/PolicyEditor";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CanaryPanel } from "@/components/CanaryPanel";

export const dynamic = "force-dynamic";

const EXAMPLE_RULE = `  - id: injection.direct
    description: Block high-confidence prompt injection or jailbreak in user input.
    when:
      surface: [input]
      detection: {entity_prefix: INJECTION, min_score: 0.85}
    effect: block
    severity: high
    reason: "Prompt-injection or jailbreak attempt detected in user input."
    controls: [NOM-RTG-01]`;

function starterTemplate(key: string, name: string, description: string, scopeAgent?: string): string {
  return `# ${name || key} — starts empty; here's a real rule to build from.
key: ${key}
name: ${name || key}
description: ${description || ""}
version: 1
mode: observe
default_effect: allow
fail_mode: open
scope:
  agents: ["${scopeAgent || "*"}"]

rules:
${EXAMPLE_RULE}
`;
}

/** A scan-proposed policy already has a saved body — just with `rules: []` — so
 * the blank-body starter template above never triggers for it. This fills the
 * SAME gap for that case: swap the empty rules line (yaml.safe_dump's flow-style
 * rendering of an empty list) for one real example rule, keeping everything else
 * (key, name, description) exactly as scanned. */
function withExampleRuleIfEmpty(body: string): string {
  return /^rules:\s*\[\s*\]\s*$/m.test(body)
    ? body.replace(/^rules:\s*\[\s*\]\s*$/m, `rules:\n${EXAMPLE_RULE}`)
    : body;
}

export default async function PolicyDetail({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ level?: string; scope_id?: string; name?: string }>;
}) {
  const { key } = await params;
  const { level: qsLevel, scope_id: qsScopeId, name: qsName } = await searchParams;
  let policy: any, bindings: any, canaryData: any;
  let isNew = false;
  try {
    [policy, bindings, canaryData] = await Promise.all([
      api(`/api/policies/${key}`),
      safeApi("/api/policies", { policies: [] }),
      safeApi(`/api/policies/${key}/canary`, { canary: null }),
    ]);
  } catch (e: any) {
    // A key with no policy behind it yet is how a scope-specific policy gets
    // created — the editor below starts from a blank starter template, pre-scoped
    // to whatever level/scope_id got us here (e.g. an agent detail page's
    // "customize for this agent" link), rather than a 404 dead end.
    if (e instanceof ApiError && e.status === 404) {
      isNew = true;
      policy = { key, name: qsName || key, description: "", versions: [] };
      bindings = { policies: [] };
      canaryData = { canary: null };
    } else {
      return (
        <>
          <h1>Policy</h1>
          <ApiDown {...apiErrorProps(e)} />
        </>
      );
    }
  }

  const binding = bindings.policies?.find((p: any) => p.key === key);
  const savedBody = policy.body?.trim() || "";
  const initialLevel = qsLevel || policy.level;
  const initialScopeId = qsScopeId || policy.scope_id;
  const scopeAgent = initialLevel === "agent" && initialScopeId && initialScopeId !== "*" ? initialScopeId : undefined;
  const body = savedBody
    ? withExampleRuleIfEmpty(savedBody)
    : starterTemplate(key, policy.name, policy.description, scopeAgent);
  const isTemplate = body !== savedBody;

  return (
    <>
      <Breadcrumbs crumbs={[{ label: "Policies", href: "/policies" }]} />
      <h1>{policy.name || key}</h1>
      <p className="sub">
        {isNew
          ? `New policy — nothing saved yet. Save below to create it${initialScopeId && initialScopeId !== "*" ? ` scoped to ${initialScopeId}` : ""}.`
          : policy.description || "No description."}
      </p>

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

      <h2>Rules — authored as YAML, enforced at runtime</h2>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 14, maxWidth: "70ch" }}>
        Edit and validate before saving — validation runs the exact same check the
        engine applies at enforcement time, so an error here is an error there.
        Saving creates a new immutable version; nothing currently in force changes
        until you promote it.
      </p>
      <PolicyEditor
        policyKey={key}
        initialBody={body}
        canEnforce={true}
        isTemplate={isTemplate}
        initialLevel={initialLevel}
        initialScopeId={initialScopeId}
        initialCompose={policy.compose}
      />

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
                    <td className="small wrap muted" style={{ maxWidth: 320 }}>{v.notes || "—"}</td>
                    <td className="num small">{v.rules}</td>
                    <td className="small muted">{ts(v.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {policy.versions?.length > 1 && (
        <>
          <h2>Canary rollout</h2>
          <CanaryPanel
            policyKey={key}
            initialCanary={canaryData?.canary ?? null}
            latestVersion={policy.versions[policy.versions.length - 1]?.version ?? 1}
          />
        </>
      )}

      {policy.compiled?.rules?.length > 0 && (
        <>
          <h2>Compiled — what actually evaluates</h2>
          <p className="small muted" style={{ marginTop: -8, marginBottom: 14, maxWidth: "70ch" }}>
            The YAML above compiles down to this — every field the engine checks, most of
            them null because most rules only use a few. Collapsed by default since this is
            the debugging view, not the everyday one.
          </p>
          <Panel title="Compiled rules">
            <details>
              <summary className="small muted" style={{ cursor: "pointer", padding: "8px 14px" }}>
                Show the compiled rule objects ({policy.compiled.rules.length})
              </summary>
              <pre className="small" style={{ margin: 0, padding: 14 }}>
                {JSON.stringify(policy.compiled.rules, null, 2)}
              </pre>
            </details>
          </Panel>
        </>
      )}
    </>
  );
}
