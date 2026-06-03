import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

function calculateDurationHours(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const status = body.status;

    if (!id || status !== "cancelled") {
      return NextResponse.json({ error: "Only status=cancelled is supported" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: booking, error: bookingError } = await admin
      .from("meeting_room_bookings")
      .select("*")
      .eq("id", id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: bookingError?.message || "Booking not found" }, { status: 404 });
    }

    const isOwner = booking.user_id === auth.user.id;
    const canManage = await canManageProperty(auth.user.id, booking.property_id);
    if (!isOwner && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ success: true, booking });
    }

    const { data: updatedBooking, error: updateError } = await admin
      .from("meeting_room_bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updatedBooking) {
      return NextResponse.json({ error: updateError?.message || "Failed to cancel booking" }, { status: 500 });
    }

    const durationHours = calculateDurationHours(booking.start_time, booking.end_time);
    if (durationHours > 0) {
      let creditQuery = admin
        .from("meeting_room_credits")
        .select("id, remaining_hours")
        .eq("property_id", booking.property_id);

      creditQuery = booking.company_id
        ? creditQuery.eq("company_id", booking.company_id)
        : creditQuery.eq("user_id", booking.user_id);

      const { data: credit } = await creditQuery.maybeSingle();
      if (credit) {
        const newRemainingHours = Number(credit.remaining_hours ?? 0) + durationHours;
        await admin
          .from("meeting_room_credits")
          .update({
            remaining_hours: newRemainingHours,
            updated_at: new Date().toISOString(),
          })
          .eq("id", credit.id);

        await admin.from("meeting_room_credit_log").insert({
          credit_id: credit.id,
          user_id: booking.user_id,
          company_id: booking.company_id,
          organization_id: booking.organization_id,
          action: "refunded",
          hours_changed: durationHours,
          hours_after: newRemainingHours,
          performed_by: auth.user.id,
          notes: `Booking cancellation refund: ${durationHours}h`
        });
      }
    }

    return NextResponse.json({ success: true, booking: updatedBooking });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-room-bookings/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
