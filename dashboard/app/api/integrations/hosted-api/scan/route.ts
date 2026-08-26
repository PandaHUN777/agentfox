/**
 * Same plain-HTML-form-POST-no-client-JS proxy pattern as
 * api/integrations/github/scan/route.ts, for the second onboarding path: a hosted
 * API endpoint plus its docs, instead of repo access.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

export const dynamic = "force-dynamic";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const endpoint_url = String(form.get("endpoint_url") || "");
  const docs_url = String(form.get("docs_url") || "");
  const openapi_spec_url = String(form.get("openapi_spec_url") || "");
  const purpose = String(form.get("purpose") || "");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  const target = new URL("/start", req.nextUrl.origin);
  target.searchParams.set("tab", "connect");
  if (!token || !endpoint_url) {
    target.searchParams.set("scan_error", "missing endpoint URL or session");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/integrations/hosted-api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        endpoint_url,
        docs_url: docs_url || null,
        openapi_spec_url: openapi_spec_url || null,
        purpose,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      target.searchParams.set("scan_error", body.detail || res.statusText);
    } else {
      target.searchParams.set("hosted_scan_run_id", body.scan_run_id);
    }
  } catch (e: any) {
    target.searchParams.set("scan_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
