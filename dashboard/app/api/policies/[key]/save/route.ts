import { NextRequest } from "next/server";
import { proxyJson } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { body, notes } = await req.json();
  return proxyJson("/api/policies", "POST", { body, notes: notes || "" });
}
