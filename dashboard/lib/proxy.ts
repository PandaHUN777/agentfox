/**
 * Shared body for the review-action route handlers (agent/policy approve & reject).
 * Each one is a plain HTML form POST with no client JS — this is what turns that
 * into an authenticated call to the gateway and a redirect back to where the
 * reviewer was, with the outcome in the query string if something went wrong.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

export async function proxyReviewAction(
  req: NextRequest,
  gatewayPath: string,
  redirectTo: string,
): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const target = new URL(redirectTo, req.nextUrl.origin);
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}${gatewayPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", body.detail || res.statusText);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}

/**
 * Same plain-HTML-form-POST-no-client-JS pattern as proxyReviewAction, but for a
 * PATCH that carries a body — the submitted form fields, forwarded verbatim as JSON.
 * Blank fields are dropped rather than sent as "" so a form re-submitted with one
 * field filled in doesn't clobber the others back to empty.
 */
export async function proxyFormPatch(
  req: NextRequest,
  gatewayPath: string,
  redirectTo: string,
): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const target = new URL(redirectTo, req.nextUrl.origin);
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  const form = await req.formData();
  const body: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && value.trim()) body[key] = value.trim();
  }

  try {
    const res = await fetch(`${API_BASE}${gatewayPath}`, {
      method: "PATCH",
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
