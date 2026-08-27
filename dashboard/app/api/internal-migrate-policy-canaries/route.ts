import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * One-off admin trigger, same reasoning as the earlier migration triggers this
 * session: the gateway's migration route needs a bearer token, and this
 * dashboard's session cookie (HttpOnly, can't be extracted and curl'd
 * directly) is the only one available. GET so it's navigable from an
 * already-signed-in browser tab. The gateway route itself is owner-role-only;
 * signing in as anything less returns 403 here, not a silent success.
 * Removed once run.
 */
export async function GET() {
  const result = await api("/api/_migrate_policy_canaries", { method: "POST" });
  return Response.json(result);
}
