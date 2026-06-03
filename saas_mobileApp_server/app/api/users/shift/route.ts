import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, isCheckedIn } = body;

    if (!propertyId || typeof isCheckedIn !== "boolean") {
      return NextResponse.json({ error: "Missing required fields: propertyId, isCheckedIn" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("resolver_stats")
      .upsert(
        { property_id: propertyId, user_id: auth.user.id, is_checked_in: isCheckedIn },
        { onConflict: "user_id,property_id" }
      )
      .select("*")
      .single();

    if (error) {
      console.error("[saas-mobile-server] shift check-in error:", error);
      return NextResponse.json({ error: "Failed to update shift status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("[saas-mobile-server] shift route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
