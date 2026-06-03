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
    const meterId = request.nextUrl.searchParams.get("meterId");
    const readingDate = request.nextUrl.searchParams.get("readingDate");
    if (!propertyId || !meterId || !readingDate) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: beforeData }, { data: afterData }, { data: meter }, { data: multData }] = await Promise.all([
      admin.from("electricity_readings").select("closing_reading").eq("property_id", propertyId).eq("meter_id", meterId).lt("reading_date", readingDate).order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("electricity_readings").select("opening_reading").eq("property_id", propertyId).eq("meter_id", meterId).gt("reading_date", readingDate).order("reading_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      admin.from("electricity_meters").select("last_reading").eq("id", meterId).maybeSingle(),
      admin.rpc("get_active_multiplier", { p_meter_id: meterId, p_date: readingDate }),
    ]);

    const opening = beforeData?.closing_reading ?? meter?.last_reading ?? 0;
    const ceiling = afterData?.opening_reading ?? null;
    const multiplier = multData?.[0] ?? null;
    return NextResponse.json({ opening, ceiling, multiplier });
  } catch (error) {
    console.error("[saas-mobile-server] electricity bounds GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
