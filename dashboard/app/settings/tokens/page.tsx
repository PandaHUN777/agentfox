import { legacyTabRedirect } from "@/lib/legacyRedirect";

/**
 * API tokens used to be its own nav item; it's now the "API tokens" tab on
 * the Start here page. This keeps old links and bookmarks working.
 */
export default async function TokensRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return legacyTabRedirect(searchParams, "/start", "tokens");
}
