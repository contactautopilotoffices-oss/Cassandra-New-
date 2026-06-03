import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await request.json();
    const { id, propertyId, status, done_date, remark } = body;
    
    if (!id || !propertyId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(await canManageProperty(auth.user.id, propertyId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    
    const { data: updated, error: updateError } = await admin
      .from("ppm_schedules")
      .update({
        status: status,
        done_date: done_date || null,
        remark: remark || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("property_id", propertyId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Failed to update schedule status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, schedule: updated });
  } catch (error) {
    console.error("[saas-mobile-server] ppm status PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
