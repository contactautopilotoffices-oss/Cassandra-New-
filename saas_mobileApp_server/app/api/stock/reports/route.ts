import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

/**
 * GET /api/stock/reports?propertyId=xxx&startDate=xxx&endDate=xxx&limit=30
 * Get stock reports for a property.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30");

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("stock_reports")
      .select("*")
      .eq("property_id", propertyId)
      .order("report_date", { ascending: false })
      .limit(limit);

    if (startDate) query = query.gte("report_date", startDate);
    if (endDate) query = query.lte("report_date", endDate);

    const { data: reports, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reports: reports ?? [],
      total: reports?.length || 0,
    });
  } catch (err) {
    console.error("[saas-mobile-server] stock reports GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/stock/reports
 * Generate a stock report for a specific date.
 *
 * Body:
 *   propertyId: string
 *   reportDate: string (YYYY-MM-DD)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { propertyId, reportDate } = body;

    if (!propertyId || !reportDate) {
      return NextResponse.json(
        { error: "propertyId and reportDate are required" },
        { status: 400 }
      );
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Get property's org
    const { data: property, error: propError } = await admin
      .from("properties")
      .select("organization_id")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Get all stock items for this property
    const { data: items, error: itemsError } = await admin
      .from("stock_items")
      .select("*")
      .eq("property_id", propertyId);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Get movements for the report date
    const { data: movements, error: movError } = await admin
      .from("stock_movements")
      .select("*")
      .eq("property_id", propertyId)
      .gte("created_at", `${reportDate}T00:00:00`)
      .lt("created_at", `${reportDate}T23:59:59`);

    if (movError) {
      return NextResponse.json({ error: movError.message }, { status: 500 });
    }

    // Calculate report data
    const totalItems = items?.length || 0;
    const lowStockCount =
      items?.filter((i) => i.quantity < (i.min_threshold || 10)).length || 0;

    const movementsList = movements || [];
    const totalAdded = movementsList
      .filter((m) => m.action === "add")
      .reduce((sum, m) => sum + (m.quantity_change || 0), 0);
    const totalRemoved = Math.abs(
      movementsList
        .filter((m) => m.action === "remove")
        .reduce((sum, m) => sum + (m.quantity_change || 0), 0)
    );

    const reportData = {
      totalItems,
      lowStockCount,
      totalAdded,
      totalRemoved,
      items:
        items?.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          minThreshold: i.min_threshold,
        })) || [],
    };

    // Upsert report
    const { data: report, error: reportError } = await admin
      .from("stock_reports")
      .upsert({
        property_id: propertyId,
        organization_id: property.organization_id,
        report_date: reportDate,
        total_items: totalItems,
        low_stock_count: lowStockCount,
        total_added: totalAdded,
        total_removed: totalRemoved,
        report_data: reportData,
        generated_by: auth.user.id,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, report }, { status: 201 });
  } catch (err) {
    console.error("[saas-mobile-server] stock reports POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
