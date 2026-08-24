import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * The knowledge-boundary declaration (PUT /api/answerability/boundary) had no UI at
 * all before this — a raw API call surfaced as copyable text on Start here. This is
 * a plain HTML form POST (no client JS), same pattern as the other review-action
 * routes, but it needs its own handler rather than the generic proxyFormPatch/
 * proxyReviewAction helpers: several fields are comma-separated lists and one is a
 * set of checkboxes, which need parsing into JSON arrays, not passed through as
 * single strings.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = new URL(`/agents/${slug}`, req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const list = (name: string) =>
    (form.get(name) as string || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const num = (name: string) => {
    const v = form.get(name) as string;
    return v && v.trim() ? Number(v) : null;
  };

  const body = {
    agent: slug,
    systems_of_record: list("systems_of_record"),
    coverage_months: num("coverage_months"),
    entity_types: list("entity_types"),
    answerable_types: form.getAll("answerable_types"),
    out_of_scope_topics: list("out_of_scope_topics"),
    freshness_hours: num("freshness_hours"),
    mode: (form.get("mode") as string) || "observe",
  };

  try {
    const res = await fetch(`${API_BASE}/api/answerability/boundary`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
