import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id");
    const status = request.nextUrl.searchParams.get("status");
    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin.from("meeting_rooms").select("*").eq("property_id", propertyId).order("name", { ascending: true });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: "Failed to fetch meeting rooms" }, { status: 500 });
    }

    return NextResponse.json({ rooms: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms GET error:", error);
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
    const { name, photo_url, propertyId, location, capacity, size, amenities, status = "active" } = body;
    if (!name || !photo_url || !propertyId || !capacity) {
      return NextResponse.json({ error: "Missing required fields: name, photo_url, propertyId, capacity" }, { status: 400 });
    }

    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: property } = await admin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle();
    const { data: room, error } = await admin
      .from("meeting_rooms")
      .insert({
        name,
        photo_url,
        property_id: propertyId,
        organization_id: property?.organization_id || null,
        location,
        capacity,
        size,
        amenities: amenities || [],
        status,
        created_by: auth.user.id
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to create meeting room" }, { status: 500 });
    }

    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
