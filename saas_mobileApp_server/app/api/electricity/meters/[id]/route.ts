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

    const { id: meterId } = await context.params;
    const body = await request.json();

    const admin = createAdminClient();

    // Verify ownership
    const { data: meter } = await admin
      .from("electricity_meters")
      .select("property_id")
      .eq("id", meterId)
      .single();

    if (!meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });

    const hasAccess = await canManageProperty(auth.user.id, meter.property_id);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin
      .from("electricity_meters")
      .update(body)
      .eq("id", meterId)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] electricity meters PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, meter: data });
  } catch (error) {
    console.error("[saas-mobile-server] electricity meters PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: meterId } = await context.params;
    const admin = createAdminClient();

    // Verify ownership
    const { data: meter } = await admin
      .from("electricity_meters")
      .select("property_id")
      .eq("id", meterId)
      .single();

    if (!meter) return NextResponse.json({ error: "Meter not found" }, { status: 404 });

    const hasAccess = await canManageProperty(auth.user.id, meter.property_id);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await admin
      .from("electricity_meters")
      .delete()
      .eq("id", meterId);

    if (error) {
      console.error("[saas-mobile-server] electricity meters DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] electricity meters DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
