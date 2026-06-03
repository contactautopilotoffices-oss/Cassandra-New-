import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageMeetingRoomCredits } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = await canManageMeetingRoomCredits(auth.user.id, propertyId);
    const admin = createAdminClient();

    let query = admin
      .from("meeting_room_credit_requests")
      .select("*, user:users!user_id(full_name, email)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      query = query.eq("user_id", auth.user.id);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] refill-requests GET error:", error);
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
    const propertyId = body.propertyId;
    const reason = body.reason || "";

    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Check tenant has a credit record
    const { data: credit } = await admin
      .from("meeting_room_credits")
      .select("id, remaining_hours")
      .eq("property_id", propertyId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (!credit) {
      return NextResponse.json({ error: "No credit record found" }, { status: 404 });
    }

    // Prevent duplicate pending requests
    const { data: existing } = await admin
      .from("meeting_room_credit_requests")
      .select("id")
      .eq("property_id", propertyId)
      .eq("user_id", auth.user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "You already have a pending refill request" }, { status: 409 });
    }

    const { data, error } = await admin
      .from("meeting_room_credit_requests")
      .insert({
        property_id: propertyId,
        user_id: auth.user.id,
        reason,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, request: data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] refill-requests POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
