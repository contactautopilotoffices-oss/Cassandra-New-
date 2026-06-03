import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageMeetingRoomCredits } from "@/lib/authorization";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = body.action;
    const hours = body.hours;
    const adminNote = body.adminNote || "";

    if (!id || !action || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "id and action (approve/reject) required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: requestData, error: reqError } = await admin
      .from("meeting_room_credit_requests")
      .select("*, property_id")
      .eq("id", id)
      .single();

    if (reqError || !requestData) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (!(await canManageMeetingRoomCredits(auth.user.id, requestData.property_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (requestData.status !== "pending") {
      return NextResponse.json({ error: "Request already reviewed" }, { status: 409 });
    }

    const { data: updatedReq, error: updateError } = await admin
      .from("meeting_room_credit_requests")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        admin_note: adminNote,
        reviewed_by: auth.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (action === "approve") {
      const { data: credit } = await admin
        .from("meeting_room_credits")
        .select("id, remaining_hours, monthly_hours")
        .eq("property_id", requestData.property_id)
        .eq("user_id", requestData.user_id)
        .maybeSingle();

      if (credit) {
        const refillHours = Number(hours) || requestData.requested_hours || 0;
        const addHours = refillHours > 0 ? refillHours : credit.monthly_hours;
        const newRemaining = Number(credit.remaining_hours) + addHours;

        await admin
          .from("meeting_room_credits")
          .update({ remaining_hours: newRemaining, updated_at: new Date().toISOString() })
          .eq("id", credit.id);

        await admin.from("meeting_room_credit_log").insert({
          credit_id: credit.id,
          user_id: requestData.user_id,
          organization_id: requestData.property_id,
          action: "request_approved",
          hours_changed: addHours,
          hours_after: newRemaining,
          performed_by: auth.user.id,
          notes: `Refill approved: ${addHours}h. Note: ${adminNote}`,
        });
      }
    }

    return NextResponse.json({ success: true, request: updatedReq });
  } catch (error) {
    console.error("[saas-mobile-server] refill-requests/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
