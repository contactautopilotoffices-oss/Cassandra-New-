import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const client = createAnonClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message ?? "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error("[saas-mobile-server] auth/login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
