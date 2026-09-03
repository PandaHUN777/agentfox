import { legacyTabRedirect } from "@/lib/legacyRedirect";

/**
 * Escalation used to be its own nav item; it's now the "Escalation" tab on
 * the Approvals page. This keeps old links and bookmarks working.
 */
export default async function EscalationRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return legacyTabRedirect(searchParams, "/approvals", "escalation");
}
