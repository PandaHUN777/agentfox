import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Client-fetchable mirror of the server-only `api()` helper, scoped to one
 * trace. Exists for the Traces list's inline-expand: the list response
 * (`search_traces`) is flat summary fields only — decisions/detector_runs/taint
 * live solely on the full-trace read, so expanding a row in place needs its own
 * request rather than reusing data already on the page.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "not signed in" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/traces/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
}
