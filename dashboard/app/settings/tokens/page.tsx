import { redirect } from "next/navigation";

/**
 * API tokens used to be its own nav item; it's now the "API tokens" tab on
 * the Start here page. This keeps old links and bookmarks working.
 */
export default function TokensRedirect() {
  redirect("/start?tab=tokens");
}
