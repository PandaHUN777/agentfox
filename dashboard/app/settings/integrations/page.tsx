import { legacyTabRedirect } from "@/lib/legacyRedirect";

/**
 * Connect used to be its own nav item; it's now the "Connect" tab on the
 * Start here page. This keeps old links and bookmarks working.
 */
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return legacyTabRedirect(searchParams, "/start", "connect");
}
