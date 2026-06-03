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
    const [{ data: meters }, { data: readings }] = await Promise.all([
      admin.from("electricity_meters").select("*").eq("property_id", propertyId).is("deleted_at", null).order("name"),
      admin.from("electricity_readings").select("*").eq("property_id", propertyId).order("reading_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    const todayStr = new Date().toISOString().split("T")[0];
    let activeTariff: any = null;
    try {
      const { data: rpcData }: any = await admin.rpc("get_active_grid_tariff", { p_property_id: propertyId, p_date: todayStr });
      if (rpcData && rpcData.length > 0) {
        activeTariff = rpcData[0];
      }
    } catch {}
    if (!activeTariff) {
      const { data: allTariffs } = await admin.from("grid_tariffs").select("*").eq("property_id", propertyId).order("effective_from", { ascending: false });
      if (allTariffs && allTariffs.length > 0) {
        activeTariff = allTariffs.find((t: any) => !t.effective_to && t.effective_from <= todayStr) || allTariffs[0];
      }
    }

    return NextResponse.json({ meters: meters ?? [], readings: readings ?? [], activeTariff });
  } catch (error) {
    console.error("[saas-mobile-server] electricity GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
