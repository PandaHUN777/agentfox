import { NextRequest } from "next/server";
import { proxyCustomBody } from "@/lib/proxy";

/**
 * Custom body rather than the generic Form* helpers: GrantIn.classes is repeated
 * checkbox values, not a single flat field, so formData().getAll() is needed.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const body = {
    resource: ((form.get("resource") as string) || "").trim(),
    principal: ((form.get("principal") as string) || "").trim(),
    principal_kind: ((form.get("principal_kind") as string) || "group").trim(),
    classes: form.getAll("classes").map(String),
  };

  return proxyCustomBody(req, "POST", "/api/entitlement/grants", "/app/entitlement", body);
}
