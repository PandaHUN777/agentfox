import Link from "next/link";
import { api } from "@/lib/api";
import { ApiDown } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * A control-to-framework mapping is a regulatory claim ("this control satisfies
 * EU AI Act Art. 9"), and evidence.build() deliberately excludes any mapping still
 * marked "draft" (Appendix B §B.6) — presenting an unreviewed mapping as evidence
 * is worse than no evidence. This page is where that review actually happens; it
 * didn't exist before, which is why every mapping in a fresh deployment stays
 * draft forever and no evidence package can ever carry a framework claim.
 */
export default async function FrameworkReview({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ review_error?: string }>;
}) {
  const { key } = await params;
  const { review_error } = await searchParams;

  let coverage: any;
  try {
    coverage = await api(`/api/frameworks/${key}`);
  } catch (e: any) {
    return (
      <>
        <h1>Frameworks</h1>
        <ApiDown error={String(e?.message || e)} />
      </>
    );
  }

  return (
    <>
      <p className="small">
        <Link href="/compliance?tab=frameworks">← Frameworks</Link>
      </p>
      <h1>{coverage.title}</h1>
      <p className="sub">
        {coverage.controls_mapped} of {coverage.controls_total} controls mapped,{" "}
        {coverage.mappings_reviewed} of {coverage.mappings_total} mappings reviewed.
        Reviewing a mapping is a human confirming the control really does satisfy
        that framework clause — evidence packages exclude anything still marked
        draft, so this is what unlocks a real compliance claim rather than a
        computed guess.
      </p>

      {review_error && <div className="error">{review_error}</div>}

      {coverage.declared_gaps?.length > 0 && (
        <div className="note-panel" style={{ marginBottom: 18 }}>
          <strong>Declared gaps</strong>
          <ul style={{ margin: "6px 0 0" }}>
            {coverage.declared_gaps.map((g: string) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel scroll-x">
        <table>
          <thead>
            <tr>
              <th>control</th>
              <th>implemented by</th>
              <th>reference(s)</th>
              <th>status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {coverage.controls.map((c: any) => (
              <tr key={c.key}>
                <td>
                  <div className="mono small" title={c.key}>{c.key}</div>
                  <div className="small muted">{c.title}</div>
                </td>
                <td className="mono muted small">{(c.implemented_by || []).join(" ")}</td>
                <td className="small muted">{(c.references || []).join(", ") || "—"}</td>
                <td>
                  <span className={`tag ${c.review_status === "reviewed" ? "ok" : "warn"}`}>
                    {c.review_status}
                  </span>
                </td>
                <td>
                  {c.review_status !== "reviewed" && (
                    <form action="/api/frameworks/review" method="POST">
                      <input type="hidden" name="control_key" value={c.key} />
                      <input type="hidden" name="framework" value={key} />
                      <button type="submit" className="btn-approve" style={{ fontSize: 12 }}>
                        Mark reviewed
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
