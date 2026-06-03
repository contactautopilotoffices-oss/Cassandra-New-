import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const body = await request.json();
    const isCheckedIn = !!body.is_checked_in;
    const userId = auth.user.id;

    const admin = createAdminClient();

    const { error } = await admin
      .from("resolver_stats")
      .upsert(
        { property_id: propertyId, user_id: userId, is_checked_in: isCheckedIn },
        { onConflict: "user_id,property_id" }
      );

    if (error) throw error;

    return NextResponse.json({ success: true, data: { is_checked_in: isCheckedIn } });
  } catch (error: any) {
    console.error("[saas-mobile-server] shift-status error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
