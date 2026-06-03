import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: room, error } = await admin
      .from("meeting_rooms")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, room.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ room });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms/[id] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, photo_url, location, capacity, size, amenities, status, propertyId } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch existing room to check property_id
    const { data: existingRoom, error: fetchError } = await admin
      .from("meeting_rooms")
      .select("property_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const targetPropertyId = propertyId || existingRoom.property_id;

    if (!(await canManageProperty(auth.user.id, targetPropertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update payload (only include defined fields)
    const updatePayload: Record<string, any> = {};
    if (name !== undefined) updatePayload.name = name;
    if (photo_url !== undefined) updatePayload.photo_url = photo_url;
    if (location !== undefined) updatePayload.location = location;
    if (capacity !== undefined) updatePayload.capacity = capacity;
    if (size !== undefined) updatePayload.size = size;
    if (amenities !== undefined) updatePayload.amenities = amenities;
    if (status !== undefined) updatePayload.status = status;
    if (propertyId && propertyId !== existingRoom.property_id) {
      updatePayload.property_id = propertyId;
      const { data: property } = await admin
        .from("properties")
        .select("organization_id")
        .eq("id", propertyId)
        .maybeSingle();
      updatePayload.organization_id = property?.organization_id || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: room, error } = await admin
      .from("meeting_rooms")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update meeting room" }, { status: 500 });
    }

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms/[id] PATCH error:", error);
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
    if (!id) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: existingRoom, error: fetchError } = await admin
      .from("meeting_rooms")
      .select("property_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!(await canManageProperty(auth.user.id, existingRoom.property_id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete: set status to inactive
    const { data: room, error } = await admin
      .from("meeting_rooms")
      .update({ status: "inactive" })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to deactivate meeting room" }, { status: 500 });
    }

    return NextResponse.json({ success: true, room });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-rooms/[id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
