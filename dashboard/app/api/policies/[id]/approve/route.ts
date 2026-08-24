import { NextRequest } from "next/server";
import { proxyReviewAction } from "@/lib/proxy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyReviewAction(req, `/api/policies/${id}/approve`, "/policies");
}
