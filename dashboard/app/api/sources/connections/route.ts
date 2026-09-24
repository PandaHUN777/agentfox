import { NextRequest } from "next/server";
import { proxyCustomBody } from "@/lib/proxy";

/**
 * Unlike the other source-editing forms, this one's fields don't map 1:1 onto
 * the request body — `config` is nested, and which fields exist depends on
 * `kind` (database vs api). That's why this isn't just proxyFormPost.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const str = (name: string) => String(form.get(name) || "").trim();
  const kind = str("kind");
  const key = str("key");

  const config: Record<string, unknown> =
    kind === "database"
      ? {
          dialect: str("dialect") || "postgresql",
          host: str("host") || undefined,
          port: str("port") ? Number(str("port")) : undefined,
          database: str("database") || undefined,
          username: str("username") || undefined,
          check_table: str("check_table") || undefined,
        }
      : {
          base_url: str("base_url"),
          auth_header: str("auth_header") || "Authorization",
          auth_prefix: str("auth_prefix") || "Bearer ",
        };

  const body: Record<string, unknown> = { key, kind, config };
  const credential = str("credential");
  if (credential) body.credential = credential;

  return proxyCustomBody(req, "POST", "/api/sources/connections", "/app/sources", body, {
    successNotice: `${key}: connected (${kind})`,
  });
}
