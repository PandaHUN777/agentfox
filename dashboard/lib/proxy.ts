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

/**
 * Same plain-HTML-form-POST-no-client-JS pattern as proxyFormPatch, but for a
 * POST (create) rather than a PATCH (update) — the eval-suite and eval-case
 * creation forms need this rather than proxyReviewAction because they carry a
 * body, and rather than proxyFormPatch because the gateway route is POST.
 */
export async function proxyFormPost(
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

/**
 * For client components that need a live response rather than a redirect (the
 * policy YAML editor validates and saves interactively) — same authenticated
 * server-side forward as the two above, but returns the gateway's JSON body (and
 * status) directly instead of redirecting, so the client can render it inline.
 */
export async function proxyJson(
  gatewayPath: string,
  method: "GET" | "POST",
  jsonBody?: unknown,
): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "not signed in" }, { status: 401 });
  }
  try {
    const res = await fetch(`${API_BASE}${gatewayPath}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: jsonBody === undefined ? undefined : JSON.stringify(jsonBody),
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ detail: String(e?.message || e) }, { status: 502 });
  }
}
