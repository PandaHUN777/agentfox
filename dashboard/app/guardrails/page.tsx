import { legacyTabRedirect } from "@/lib/legacyRedirect";

/**
 * Guardrails used to be its own nav item; it's now the "Guardrail tuning" tab
 * on the Policies page. This keeps old links and bookmarks working.
 */
export default async function GuardrailsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return legacyTabRedirect(searchParams, "/policies", "guardrails");
}
