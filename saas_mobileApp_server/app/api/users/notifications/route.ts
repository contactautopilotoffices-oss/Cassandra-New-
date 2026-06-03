import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const after = searchParams.get("after"); // For polling new notifications

    const admin = createAdminClient();
    
    let query = admin
      .from("notifications")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (after) {
      query = query.gt("created_at", after);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[saas-mobile-server] GET /api/users/notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, notificationId } = body;

    const admin = createAdminClient();

    if (action === "mark_read") {
      if (!notificationId) {
        return NextResponse.json({ error: "Missing notificationId" }, { status: 400 });
      }

      // Security: ensure the notification belongs to the user
      const { data: notif, error: fetchErr } = await admin
        .from("notifications")
        .select("user_id")
        .eq("id", notificationId)
        .single();
        
      if (fetchErr || !notif || notif.user_id !== auth.user.id) {
        return NextResponse.json({ error: "Notification not found or unauthorized" }, { status: 404 });
      }

      const { error } = await admin
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });

    } else if (action === "mark_all_read") {
      const { error } = await admin
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", auth.user.id)
        .eq("is_read", false);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });

    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[saas-mobile-server] PATCH /api/users/notifications error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
