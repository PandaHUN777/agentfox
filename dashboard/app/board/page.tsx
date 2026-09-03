import { legacyTabRedirect } from "@/lib/legacyRedirect";

/**
 * Board view used to be its own nav item; it's now the "Board" tab on the
 * Compliance page, which already computed most of the same data. This keeps
 * old links and bookmarks working.
 */
export default async function BoardRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return legacyTabRedirect(searchParams, "/compliance", "board");
}
