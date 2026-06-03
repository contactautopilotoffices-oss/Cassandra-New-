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
    const materialRequestId = searchParams.get("materialRequestId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    let query = admin
      .from("procurement_orders")
      .select(
        `
        *,
        material_request:material_requests(id, status, ticket_id),
        ticket:tickets!inner(ticket_number, title),
        ordered_by_user:users!procurement_orders_ordered_by_fkey(full_name, email)
        `
      )
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (materialRequestId) {
      query = query.eq("material_request_id", materialRequestId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[saas-mobile-server] procurement orders GET error:", error);
      return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
    }

    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] procurement orders GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
