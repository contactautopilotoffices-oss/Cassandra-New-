import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("meter_multipliers").select("*").eq("property_id", propertyId).order("effective_from", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to fetch meter multipliers" }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const propertyId = body.propertyId || body.property_id;
    if (!propertyId || !body.multiplier || !body.effective_from) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const effectiveFrom = String(body.effective_from);
    const dayBefore = new Date(effectiveFrom);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split("T")[0];

    await admin
      .from("meter_multipliers")
      .update({ effective_to: dayBeforeStr })
      .eq("property_id", propertyId)
      .is("effective_to", null)
      .lt("effective_from", effectiveFrom);

    const { data, error } = await admin
      .from("meter_multipliers")
      .insert({
        property_id: propertyId,
        multiplier: body.multiplier,
        effective_from: effectiveFrom,
        created_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed to create multiplier" }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
