import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Custom rather than proxyFormPost: EvalCase.input/expected/context are each their
 * own JSON object server-side (CaseIn in evaluation.py), not flat fields, so the
 * form's prompt/goal/retrieved inputs need reshaping before they're forwarded.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const target = new URL(`/evals/${key}`, req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const prompt = ((form.get("prompt") as string) || "").trim();
  const goal = ((form.get("goal") as string) || "").trim();
  const retrieved = ((form.get("retrieved") as string) || "").trim();

  const body = {
    input: { prompt },
    expected: goal ? { goal } : {},
    context: retrieved ? { retrieved: retrieved.split("\n").filter(Boolean) } : {},
    split: "test",
  };

  try {
    const res = await fetch(`${API_BASE}/api/eval/suites/${key}/cases`, {
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
