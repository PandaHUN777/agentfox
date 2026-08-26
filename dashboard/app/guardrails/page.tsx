import { redirect } from "next/navigation";

/**
 * Guardrails used to be its own nav item; it's now the "Guardrail tuning" tab
 * on the Policies page. This keeps old links and bookmarks working.
 */
export default async function GuardrailsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("tab", "guardrails");
  redirect(`/policies?${query.toString()}`);
}
