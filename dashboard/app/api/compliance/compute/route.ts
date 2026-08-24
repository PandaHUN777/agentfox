import { NextRequest } from "next/server";
import { proxyReviewAction } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return proxyReviewAction(req, "/api/controls/compute", "/compliance");
}
