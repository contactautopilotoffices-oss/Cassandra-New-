import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { getISTDateBounds } from "@/lib/timezone";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const status = request.nextUrl.searchParams.get("status");
    const search = request.nextUrl.searchParams.get("search");
    const date = request.nextUrl.searchParams.get("date"); // 'today' | 'yesterday' | 'week' | 'month' | custom date
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();

    // Helper to apply common filters (date & search) to any query
    const applyCommonFilters = (q: any) => {
      let filteredQ = q;

      // Apply date filter
      if (date) {
        let filterType = date as any;
        let customStr = undefined;
        if (!['today', 'yesterday', 'week', 'month'].includes(date)) {
          filterType = 'custom';
          customStr = date;
        }
        const bounds = getISTDateBounds(filterType, customStr);
        filteredQ = filteredQ.gte('checkin_time', bounds.start).lte('checkin_time', bounds.end);
      }

      // Apply search filter
      if (search) {
        const term = `%${search}%`;
        filteredQ = filteredQ.or(`visitor_id.ilike.${term},name.ilike.${term},mobile.ilike.${term},whom_to_meet.ilike.${term}`);
      }

      return filteredQ;
    };

    // 1. Fetch visitors list
    let listQuery = admin
      .from("visitor_logs")
      .select("*")
      .eq("property_id", propertyId)
      .order("checkin_time", { ascending: false });

    // Apply status filter to list query only
    if (status && status !== "all") {
      listQuery = listQuery.eq("status", status);
    }

    // Apply common filters (date & search) to list query
    listQuery = applyCommonFilters(listQuery);

    const { data, error } = await listQuery.limit(100);
    if (error) return NextResponse.json({ error: "Failed to fetch visitors" }, { status: 500 });

    // 2. Fetch stats with exact same filters dynamically applied
    const statsTotalQuery = admin
      .from("visitor_logs")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId);

    const statsInQuery = admin
      .from("visitor_logs")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("status", "checked_in");

    const statsOutQuery = admin
      .from("visitor_logs")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("status", "checked_out");

    const [
      { count: totalCount },
      { count: checkedInCount },
      { count: checkedOutCount },
    ] = await Promise.all([
      applyCommonFilters(statsTotalQuery),
      applyCommonFilters(statsInQuery),
      applyCommonFilters(statsOutQuery),
    ]);

    return NextResponse.json({
      visitors: data ?? [],
      stats: {
        total_today: totalCount || 0,
        checked_in: checkedInCount || 0,
        checked_out: checkedOutCount || 0,
      },
    });
  } catch (error) {
    console.error("[saas-mobile-server] visitors GET error:", error);
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
    const propertyId = body.propertyId || body.property_id;
    if (!propertyId || !body.name || !body.whom_to_meet || !body.category) {
      return NextResponse.json({ error: "Missing visitor fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: property } = await admin.from("properties").select("organization_id").eq("id", propertyId).single();

    let visitorId = "";
    try {
      const { data: generatedId } = await admin.rpc("generate_visitor_id", { p_property_id: propertyId });
      if (generatedId) visitorId = generatedId;
    } catch {}
    if (!visitorId) {
      visitorId = `VIS-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    const { data: visitor, error } = await admin
      .from("visitor_logs")
      .insert({
        property_id: propertyId,
        organization_id: property?.organization_id ?? null,
        visitor_id: visitorId,
        category: body.category,
        name: body.name,
        mobile: body.mobile ?? null,
        coming_from: body.coming_from ?? null,
        whom_to_meet: body.whom_to_meet,
        whom_to_meet_uid: body.whom_to_meet_uid ?? null,
        purpose: body.purpose ?? null,
        photo_url: body.photo_url ?? null,
        checkin_time: new Date().toISOString(),
        status: "checked_in",
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed to create visitor log" }, { status: 500 });

    return NextResponse.json({ success: true, visitorId, visitor, message: `Welcome ${body.name}! Visit logged.` }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] visitors POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
