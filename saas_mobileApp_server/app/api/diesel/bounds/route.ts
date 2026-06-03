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
    const generatorId = request.nextUrl.searchParams.get("generatorId");
    const readingDate = request.nextUrl.searchParams.get("readingDate");
    if (!propertyId || !generatorId || !readingDate) {
      return NextResponse.json({ error: "Missing diesel bound params" }, { status: 400 });
    }
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: beforeData }, { data: afterData }, { data: generator }] = await Promise.all([
      admin.from("diesel_readings").select("closing_hours, closing_diesel_level, closing_kwh").eq("property_id", propertyId).eq("generator_id", generatorId).lt("reading_date", readingDate).order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("diesel_readings").select("opening_hours, opening_diesel_level").eq("property_id", propertyId).eq("generator_id", generatorId).gt("reading_date", readingDate).order("reading_date", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      admin.from("generators").select("initial_run_hours, initial_diesel_level, initial_kwh_reading").eq("id", generatorId).maybeSingle(),
    ]);

    const opening = beforeData
      ? { hours: beforeData.closing_hours, diesel: beforeData.closing_diesel_level, kwh: beforeData.closing_kwh ?? 0 }
      : { hours: generator?.initial_run_hours ?? 0, diesel: generator?.initial_diesel_level ?? 0, kwh: generator?.initial_kwh_reading ?? 0 };
    const ceiling = { hours: afterData?.opening_hours ?? null, diesel: afterData?.opening_diesel_level ?? null };

    return NextResponse.json({ opening, ceiling });
  } catch (error) {
    console.error("[saas-mobile-server] diesel bounds GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
