import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
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
    const generatorId = searchParams.get("generatorId");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin.from("diesel_readings").select("*").eq("property_id", propertyId);

    if (generatorId) query = query.eq("generator_id", generatorId);
    if (fromDate) query = query.gte("reading_date", fromDate);
    if (toDate) query = query.lte("reading_date", toDate);

    query = query.order("reading_date", { ascending: false }).order("created_at", { ascending: false });

    const { data: readings, error } = await query;

    if (error) {
      console.error("[saas-mobile-server] diesel readings GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, readings: readings ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] diesel readings GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
