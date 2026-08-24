/**
 * Proxies a scan trigger from a plain HTML form (no client JS) to the gateway,
 * then redirects back to the Connect page with the result in the query string —
 * the gateway does all the actual work (download, static scan, draft creation).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

export const dynamic = "force-dynamic";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const repo_full_name = String(form.get("repo_full_name") || "");
  const ref = String(form.get("ref") || "");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  const target = new URL("/settings/integrations", req.nextUrl.origin);
  if (!token || !repo_full_name) {
    target.searchParams.set("scan_error", "missing repository or session");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/integrations/github/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ repo_full_name, ref }),
    });
    const body = await res.json();
    if (!res.ok) {
      target.searchParams.set("scan_error", body.detail || res.statusText);
    } else {
      target.searchParams.set("scan_run_id", body.scan_run_id);
    }
  } catch (e: any) {
    target.searchParams.set("scan_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
