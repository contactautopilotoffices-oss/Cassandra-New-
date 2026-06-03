import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim();
    const redirectTo = body?.redirectTo ? String(body.redirectTo) : undefined;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const client = createAnonClient();
    const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] auth/reset-password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
