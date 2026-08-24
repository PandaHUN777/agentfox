import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Custom rather than a shared proxy helper: EvidenceIn.agents/controls are each
 * their own array server-side, not flat strings, so the form's comma-separated
 * text inputs need splitting before they're forwarded. Blank date fields are
 * dropped rather than sent as "" so the backend's own "*"/unbounded defaults apply.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/compliance?tab=evidence", req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const split = (name: string) =>
    ((form.get(name) as string) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const dateField = (name: string) => {
    const raw = (form.get(name) as string) || "";
    return raw ? new Date(raw).toISOString() : undefined;
  };

  const body: Record<string, unknown> = {};
  const agents = split("agents");
  const controls = split("controls");
  if (agents.length) body.agents = agents;
  if (controls.length) body.controls = controls;
  const periodFrom = dateField("period_from");
  const periodTo = dateField("period_to");
  if (periodFrom) body.period_from = periodFrom;
  if (periodTo) body.period_to = periodTo;

  try {
    const res = await fetch(`${API_BASE}/api/evidence`, {
      method: "POST",
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
