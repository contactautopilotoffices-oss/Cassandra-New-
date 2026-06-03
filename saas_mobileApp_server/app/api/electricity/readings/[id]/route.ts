import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const { id } = await params;
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: reading } = await admin.from("electricity_readings").select("*").eq("id", id).eq("property_id", propertyId).maybeSingle();
    if (!reading) return NextResponse.json({ error: "Reading not found" }, { status: 404 });

    const { error } = await admin.from("electricity_readings").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Failed to delete reading" }, { status: 500 });

    const { data: remaining } = await admin
      .from("electricity_readings")
      .select("closing_reading")
      .eq("meter_id", reading.meter_id)
      .eq("property_id", propertyId)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await admin.from("electricity_meters").update({ last_reading: remaining?.closing_reading ?? 0 }).eq("id", reading.meter_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] electricity reading DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
