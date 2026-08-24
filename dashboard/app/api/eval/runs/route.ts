import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Custom rather than proxyFormPost: RunIn.target is its own JSON object
 * (agent/provider/model) and scorers is a list built from repeated checkboxes,
 * neither of which the flat form-to-JSON helper produces.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const suite = (form.get("suite") as string) || "";
  const target = new URL(`/evals/${suite}`, req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const agent = ((form.get("agent") as string) || "").trim();
  const provider = ((form.get("provider") as string) || "echo").trim();
  const model = ((form.get("model") as string) || "echo-1").trim();
  const scorers = form.getAll("scorers") as string[];

  const body = {
    suite,
    target: { ...(agent ? { agent } : {}), provider, model },
    scorers: scorers.length ? scorers : null,
  };

  try {
    const res = await fetch(`${API_BASE}/api/eval/runs`, {
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
