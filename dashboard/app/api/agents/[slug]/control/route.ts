import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

const ACTIONS = new Set(["quarantine", "kill", "resume"]);

/**
 * One route for all three transitions (quarantine/kill/resume) — same shape
 * (`reason` in the body, `POST /api/agents/{slug}/{action}` on the backend),
 * just a different action per form's hidden field.
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
  const action = String(form.get("action") || "");
  if (!ACTIONS.has(action)) {
    target.searchParams.set("review_error", "invalid control action");
    return NextResponse.redirect(target);
  }
  const reason = String(form.get("reason") || "");

  try {
    const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(slug)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else {
      const past: Record<string, string> = { quarantine: "quarantined", kill: "killed", resume: "resumed" };
      target.searchParams.set("review_notice", `agent ${past[action]}`);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
