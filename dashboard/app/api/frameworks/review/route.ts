import { NextRequest } from "next/server";
import { proxyFormPost } from "@/lib/proxy";

export async function POST(req: NextRequest) {
  return proxyFormPost(req, "/api/frameworks/review", "/compliance?tab=frameworks");
}
