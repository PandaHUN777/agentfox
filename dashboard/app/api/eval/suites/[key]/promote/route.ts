import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const target = new URL(`/evals/${key}`, req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const traceId = ((form.get("trace_id") as string) || "").trim();
  if (!traceId) {
    target.searchParams.set("review_error", "trace id is required");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/eval/suites/${key}/cases/from-trace?trace_id=${encodeURIComponent(traceId)}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
