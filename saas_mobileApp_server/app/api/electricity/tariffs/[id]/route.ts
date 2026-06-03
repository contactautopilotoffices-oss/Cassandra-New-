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
    const { id } = await params;
    const admin = createAdminClient();
    const { data: tariff } = await admin.from("grid_tariffs").select("property_id").eq("id", id).maybeSingle();
    const propertyId = tariff?.property_id ?? null;
    if (!propertyId) return NextResponse.json({ error: "Tariff not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await admin
      .from("electricity_readings")
      .update({ tariff_id: null, tariff_rate_used: null, computed_cost: 0 })
      .eq("tariff_id", id)
      .eq("property_id", propertyId);

    const { error } = await admin.from("grid_tariffs").delete().eq("id", id).eq("property_id", propertyId);
    if (error) return NextResponse.json({ error: "Failed to delete tariff" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] electricity tariff DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!id) return NextResponse.json({ error: "Missing tariff id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: tariff, error: fetchError } = await admin.from("grid_tariffs").select("property_id").eq("id", id).single();
    if (fetchError || !tariff) return NextResponse.json({ error: "Tariff not found" }, { status: 404 });

    if (!(await canManageProperty(auth.user.id, tariff.property_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin.from("grid_tariffs").update(body).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] grid_tariffs/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
