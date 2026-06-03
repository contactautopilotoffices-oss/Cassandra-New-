import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const admin = createAdminClient();
    
    // Check ticket access
    const { data: ticket, error: ticketError } = await admin.from("tickets").select("property_id").eq("id", id).single();
    if (ticketError || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin
      .from("ticket_comments")
      .select("*, user:users(full_name, user_photo_url)")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id]/comments GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const body = await request.json();

    const admin = createAdminClient();

    // Check ticket access
    const { data: ticket, error: ticketError } = await admin.from("tickets").select("property_id").eq("id", id).single();
    if (ticketError || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin
      .from("ticket_comments")
      .insert({
        ticket_id: id,
        user_id: auth.user.id,
        comment: body.comment,
        is_internal: body.is_internal ?? false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id]/comments POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
