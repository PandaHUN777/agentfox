import { redirect } from "next/navigation";

/**
 * Board view used to be its own nav item; it's now the "Board" tab on the
 * Compliance page, which already computed most of the same data. This keeps
 * old links and bookmarks working.
 */
export default function BoardRedirect() {
  redirect("/compliance?tab=board");
}
