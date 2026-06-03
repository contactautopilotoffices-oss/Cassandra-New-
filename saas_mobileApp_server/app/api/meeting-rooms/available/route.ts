import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    const date = searchParams.get("date");
    const capacity = parseInt(searchParams.get("capacity") || "0", 10);
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!propertyId || !date) {
      return NextResponse.json({ error: "propertyId and date are required" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    let roomQuery = admin
      .from("meeting_rooms")
      .select("*")
      .eq("property_id", propertyId)
      .eq("status", "active");

    if (capacity > 0) {
      roomQuery = roomQuery.gte("capacity", capacity);
    }

    const { data: rooms, error: roomsError } = await roomQuery.order("name", { ascending: true });
    if (roomsError) {
      return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
    }

    let bookingQuery = admin
      .from("meeting_room_bookings")
      .select("*")
      .eq("property_id", propertyId)
      .eq("booking_date", date)
      .eq("status", "confirmed");

    if (startTime && endTime) {
      bookingQuery = bookingQuery.lt("start_time", endTime).gt("end_time", startTime);
    }

    const { data: bookings, error: bookingsError } = await bookingQuery;
    if (bookingsError) {
      return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
    }

    const roomsWithBookings = (rooms || []).map((room: any) => ({
      ...room,
      bookings: (bookings || []).filter((b: any) => b.meeting_room_id === room.id),
    }));

    return NextResponse.json({ rooms: roomsWithBookings });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms/available GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
