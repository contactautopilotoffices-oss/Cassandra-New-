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
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("procurement_activity_log")
      .select(
        `
        *,
        user:users!procurement_activity_log_user_id_fkey(full_name, email),
        material_request:material_requests!inner(property_id, ticket_id, service_description),
        ticket:tickets!inner(ticket_number, title)
        `
      )
      .eq("material_request.property_id", propertyId)
      .neq("action", "deleted")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[saas-mobile-server] procurement activity GET error:", error);
      return NextResponse.json({ error: "Failed to fetch activity log" }, { status: 500 });
    }

    return NextResponse.json({ activities: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] procurement activity GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
