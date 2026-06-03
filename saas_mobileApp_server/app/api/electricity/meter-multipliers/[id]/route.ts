import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    if (!id) return NextResponse.json({ error: "Missing multiplier id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: multiplier, error: fetchError } = await admin.from("meter_multipliers").select("property_id").eq("id", id).single();
    if (fetchError || !multiplier) return NextResponse.json({ error: "Multiplier not found" }, { status: 404 });

    if (!(await canManageProperty(auth.user.id, multiplier.property_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin.from("meter_multipliers").update(body).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing multiplier id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: multiplier, error: fetchError } = await admin.from("meter_multipliers").select("property_id").eq("id", id).single();
    if (fetchError || !multiplier) return NextResponse.json({ error: "Multiplier not found" }, { status: 404 });

    if (!(await canManageProperty(auth.user.id, multiplier.property_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin.from("meter_multipliers").delete().eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] meter_multipliers/[id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
