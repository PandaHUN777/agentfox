import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * A full independent re-derivation of the audit-chain hash, on demand — the
 * same check an evidence package runs at build time, but without having to
 * build a package first just to ask "is the chain intact right now?"
 */
export async function POST(req: NextRequest) {
  const target = new URL("/compliance", req.nextUrl.origin);
  target.searchParams.set("tab", "evidence");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

  try {
    const res = await fetch(`${API_BASE}/api/audit/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      target.searchParams.set("review_error", body.detail || res.statusText);
    } else if (body.valid) {
      target.searchParams.set(
        "review_notice",
        `chain verified — ${body.entries_checked} entr${body.entries_checked === 1 ? "y" : "ies"} (seq ${body.first_seq ?? "—"}–${body.last_seq ?? "—"}), ${body.checkpoints_checked} checkpoint(s), intact`,
      );
    } else {
      target.searchParams.set(
        "review_error",
        `chain verification FAILED at seq ${body.first_break?.seq ?? "?"}: ${body.first_break?.detail ?? "unknown break"}`,
      );
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
