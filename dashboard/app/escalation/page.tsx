import { redirect } from "next/navigation";

/**
 * Escalation used to be its own nav item; it's now the "Escalation" tab on
 * the Approvals page. This keeps old links and bookmarks working.
 */
export default async function EscalationRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("tab", "escalation");
  redirect(`/approvals?${query.toString()}`);
}
