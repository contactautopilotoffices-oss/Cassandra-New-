import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("electricity_readings")
      .select("*")
      .eq("property_id", propertyId)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to fetch electricity history" }, { status: 500 });
    return NextResponse.json({ readings: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] electricity history GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
