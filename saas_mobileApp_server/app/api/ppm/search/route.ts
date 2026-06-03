import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const term = searchParams.get("q");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    if (!term) {
      return NextResponse.json({ success: true, schedules: [] });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: schedules, error } = await admin
      .from("ppm_schedules")
      .select("id, system_name, detail_name, frequency, planned_date, done_date, status, description, location")
      .eq("property_id", propertyId)
      .or(`system_name.ilike.%${term}%,detail_name.ilike.%${term}%`)
      .order("planned_date", { ascending: true });

    if (error) {
      console.error("[saas-mobile-server] ppm search GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, schedules: schedules ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] ppm search GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
