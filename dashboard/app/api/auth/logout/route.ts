import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
