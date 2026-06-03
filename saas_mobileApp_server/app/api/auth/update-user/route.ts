import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSupabase } from "@/lib/mobileClient";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthorizedSupabase(request);
    if (auth.response || !auth.client) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updatePayload: Record<string, unknown> = {};

    if (body?.email !== undefined) updatePayload.email = body.email;
    if (body?.password !== undefined) updatePayload.password = body.password;
    if (body?.phone !== undefined) updatePayload.phone = body.phone;
    if (body?.data !== undefined) updatePayload.data = body.data;

    const { data, error } = await auth.client.auth.updateUser(updatePayload as any);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      user: data.user,
    });
  } catch (error) {
    console.error("[saas-mobile-server] auth/update-user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
