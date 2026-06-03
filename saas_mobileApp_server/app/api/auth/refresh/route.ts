import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken = String(body?.refresh_token ?? body?.refreshToken ?? "").trim();

    if (!refreshToken) {
      return NextResponse.json({ error: "refresh_token is required" }, { status: 400 });
    }

    const client = createAnonClient();
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message ?? "Unable to refresh session" }, { status: 401 });
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error("[saas-mobile-server] auth/refresh error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
