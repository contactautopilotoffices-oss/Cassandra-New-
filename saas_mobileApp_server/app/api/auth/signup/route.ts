import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim();
    const password = String(body?.password ?? "");
    const fullName = String(body?.fullName ?? body?.options?.data?.full_name ?? "").trim();

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const client = createAnonClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user?.id) {
      const admin = createAdminClient();
      await admin.from("users").upsert(
        {
          id: data.user.id,
          email,
          full_name: fullName || null,
        },
        { onConflict: "id" }
      );
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error("[saas-mobile-server] auth/signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
