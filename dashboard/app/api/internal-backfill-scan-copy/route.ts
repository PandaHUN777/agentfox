import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * One-off admin trigger: the gateway's own /api/_backfill_scan_copy needs a bearer
 * token, and this dashboard is the only place holding one (the session cookie is
 * HttpOnly and origin-scoped, so it can't be extracted and curl'd directly). GET so
 * it's navigable from a browser tab that's already signed in. Removed once run.
 */
export async function GET() {
  const result = await api("/api/_backfill_scan_copy", { method: "POST" });
  return Response.json(result);
}
