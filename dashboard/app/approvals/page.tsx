import Link from "next/link";
import { api, safeApi } from "@/lib/api";
import { ApiDown, Empty, InfoTip, ts } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "denied", "expired"];

/**
 * P2-3 — a human sign-off on one specific tool call, distinct from Escalation's
 * hand-offs (which transfer a whole conversation). This existed as an API with
 * no page: an agent that hit an approval gate had a working backend and no way
 * for anyone to actually see or answer the request.
 */
export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; review_error?: string; review_notice?: string }>;
}) {
  const { status: rawStatus, review_error, review_notice } = await searchParams;
  const status = STATUSES.includes(rawStatus || "") ? rawStatus! : "pending";

  let approvals: any, agents: any;
  try {
    [approvals, agents] = await Promise.all([
      api(`/api/approvals?status=${status}`),
      safeApi("/api/agents", { agents: [] }),
    ]);
  } catch (e: any) {
    return (
      <>
        <h1>Approvals</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  const agentSlug: Record<string, string> = {};
  for (const a of agents.agents || []) agentSlug[a.id] = a.slug;

  return (
    <>
      <h1>Approvals</h1>
      <p className="sub">
        Human sign-off on one specific tool call — distinct from{" "}
        <Link href="/escalation">Escalation</Link>'s hand-offs, which transfer a whole
        conversation. An unanswered approval denies automatically once it expires
        (fail-closed) rather than sitting open forever.
      </p>

      {review_error && <div className="error">{review_error}</div>}
      {review_notice && <div className="note-panel">{review_notice}</div>}

      <div className="chipbar" style={{ marginBottom: 4 }}>
        <span className="chipbar-label">status:</span>
        {STATUSES.map((s) => (
          <Link key={s} href={`/approvals?status=${s}`} className={`chip${status === s ? " active" : ""}`}>
            {s}
          </Link>
        ))}
      </div>

      <div className="panel scroll-x">
        {approvals.approvals?.length ? (
          <table>
            <thead>
              <tr>
                <th>agent</th>
                <th>tool</th>
                <th>reason</th>
                <th>arguments</th>
                <th>requested</th>
                <th>
                  expires
                  <InfoTip text="Past this time, an unanswered request denies automatically — the default timeout action fails closed rather than leaving a risky call in limbo." />
                </th>
                {status === "pending" && <th></th>}
              </tr>
            </thead>
            <tbody>
              {approvals.approvals.map((a: any) => (
                <tr key={a.id}>
                  <td className="small">
                    {agentSlug[a.agent_id] ? (
                      <Link href={`/agents/${agentSlug[a.agent_id]}`}>{agentSlug[a.agent_id]}</Link>
                    ) : (
                      <span className="muted">unattributed</span>
                    )}
                  </td>
                  <td className="mono small">{a.tool || "—"}</td>
                  <td className="small wrap muted" style={{ maxWidth: 260 }}>{a.reason || "—"}</td>
                  <td className="small wrap mono muted" style={{ maxWidth: 260, fontSize: 11 }}>
                    {a.arguments && Object.keys(a.arguments).length ? JSON.stringify(a.arguments) : "—"}
                  </td>
                  <td className="small muted">{ts(a.requested_at)}</td>
                  <td className="small muted">{ts(a.expires_at)}</td>
                  {status === "pending" && (
                    <td className="small">
                      <div className="review-actions" style={{ flexDirection: "column", gap: 4 }}>
                        <form action={`/api/approvals/${a.id}/approve`} method="POST" className="row" style={{ gap: 4 }}>
                          <input type="text" name="rationale" placeholder="rationale (optional)" style={{ padding: "3px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontSize: 11.5, width: 130 }} />
                          <button type="submit" className="btn-approve">Approve</button>
                        </form>
                        <form action={`/api/approvals/${a.id}/deny`} method="POST">
                          <button type="submit" className="btn-reject">Deny</button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>
            No {status} approvals. {status === "pending" && "Every governed tool call is either allowed outright or has already been answered."}
          </Empty>
        )}
      </div>
    </>
  );
}
