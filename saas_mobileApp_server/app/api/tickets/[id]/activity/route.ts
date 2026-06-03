import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing ticket id" }, { status: 400 });

    const body = await request.json();
    const { action, details } = body;

    if (!action) return NextResponse.json({ error: "Missing action parameter" }, { status: 400 });

    const admin = createAdminClient();
    const { data: ticket, error: fetchError } = await admin.from("tickets").select("property_id").eq("id", id).single();
    if (fetchError || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, ticket.property_id);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin.from("ticket_activity_log").insert({
      ticket_id: id,
      performed_by: auth.user.id,
      action,
      details,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] tickets/[id]/activity POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
