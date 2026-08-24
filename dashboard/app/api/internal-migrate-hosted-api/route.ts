import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * One-off admin trigger, same reasoning as the finding-resolution backfill
 * trigger: the gateway's migration route needs a bearer token, and this
 * dashboard's session cookie (HttpOnly, can't be extracted and curl'd directly)
 * is the only one available. GET so it's navigable from an already-signed-in
 * browser tab. Removed once run.
 */
export async function GET() {
  const result = await api("/api/_migrate_hosted_api_integration", { method: "POST" });
  return Response.json(result);
}
