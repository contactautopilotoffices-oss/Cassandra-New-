import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteCache } from "@/lib/cache";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: ticket, error } = await admin
      .from("tickets")
      .select("*, raised_by_user:raised_by(full_name), assigned_to_user:assigned_to(full_name), comments:ticket_comments(*)")
      .eq("id", id)
      .single();

    if (error || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Verify property access
    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id] GET error:", error);
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

    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: ticket, error: fetchError } = await admin.from("tickets").select("property_id").eq("id", id).single();
    if (fetchError || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin.from("tickets").update(body).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Invalidate dashboard cache for this property
    await deleteCache(`dashboard:${ticket.property_id}:${auth.user.id}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id] PATCH error:", error);
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
    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: ticket, error: fetchError } = await admin.from("tickets").select("property_id").eq("id", id).single();
    if (fetchError || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin.from("tickets").delete().eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Invalidate dashboard cache
    await deleteCache(`dashboard:${ticket.property_id}:${auth.user.id}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
