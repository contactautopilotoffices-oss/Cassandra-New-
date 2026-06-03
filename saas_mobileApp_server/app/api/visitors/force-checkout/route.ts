import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

/**
 * POST /api/visitors/force-checkout?propertyId=...
 * Admin / org_super_admin force checkout for visitors who forgot to check out.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { visitor_log_id, reason } = body;

    if (!visitor_log_id) {
      return NextResponse.json({ error: "visitor_log_id required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch visitor
    const { data: visitor, error: fetchError } = await admin
      .from("visitor_logs")
      .select("*")
      .eq("id", visitor_log_id)
      .eq("property_id", propertyId)
      .single();

    if (fetchError || !visitor) {
      return NextResponse.json({ error: "Visitor not found" }, { status: 404 });
    }

    if (visitor.status === "checked_out") {
      return NextResponse.json({ error: "Visitor already checked out" }, { status: 400 });
    }

    // Force checkout
    const { data: updated, error: updateError } = await admin
      .from("visitor_logs")
      .update({
        status: "checked_out",
        checkout_time: new Date().toISOString(),
      })
      .eq("id", visitor_log_id)
      .select()
      .single();

    if (updateError) {
      console.error("[VMS] Force checkout DB error:", updateError);
      return NextResponse.json({ error: "Failed to checkout" }, { status: 500 });
    }

    // Audit log (non-blocking)
    void admin.from("property_activities").insert({
      property_id: propertyId,
      user_id: auth.user.id,
      action: "vms_force_checkout",
      details: {
        visitor_id: visitor.visitor_id,
        visitor_name: visitor.name,
        reason: reason || "Force checkout by admin",
      },
    });

    return NextResponse.json({
      success: true,
      message: `${visitor.name} has been checked out`,
      visitor: updated,
    });
  } catch (error) {
    console.error("Force checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
