import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/api";

const API_BASE = process.env.NOMETRIA_API_URL || "http://127.0.0.1:8080";

/**
 * Unlike the other source-editing forms, this one's fields don't map 1:1 onto
 * the request body — `config` is nested, and which fields exist depends on
 * `kind` (database vs api). That's why this isn't just `proxyFormPost`.
 */
export async function POST(req: NextRequest) {
  const target = new URL("/sources", req.nextUrl.origin);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    target.searchParams.set("review_error", "not signed in");
    return NextResponse.redirect(target);
  }

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

  try {
    const res = await fetch(`${API_BASE}/api/sources/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      target.searchParams.set("review_error", resBody.detail || res.statusText);
    } else {
      target.searchParams.set("review_notice", `${key}: connected (${kind})`);
    }
  } catch (e: any) {
    target.searchParams.set("review_error", String(e?.message || e));
  }
  return NextResponse.redirect(target);
}
