import { redirect } from "next/navigation";

/**
 * Connect used to be its own nav item; it's now the "Connect" tab on the
 * Start here page. This keeps old links and bookmarks working.
 */
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("tab", "connect");
  redirect(`/start?${query.toString()}`);
}
