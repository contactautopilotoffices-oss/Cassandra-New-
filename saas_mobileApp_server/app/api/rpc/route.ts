import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.fn !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'fn' field" }, { status: 400 });
    }

    const { fn, params = {} } = body;
    const admin = createAdminClient();

    const { data, error } = await admin.rpc(fn, params);

    if (error) {
      console.error(`[rpc] Supabase RPC error for "${fn}":`, error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[rpc] Internal server error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
