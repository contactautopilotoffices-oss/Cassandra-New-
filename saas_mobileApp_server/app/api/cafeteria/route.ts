import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === "undefined" || propertyId === "null") {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // ── 1. Food vendors for this property ─────────────────────────────────────
    // Vendors may be flagged via role, service_type, or category column
    const { data: vendors, error: vendorsError } = await admin
      .from("vendors")
      .select("id, property_id, name, email, phone, service_type, commission_rate, monthly_rent, status, contract_start_date, contract_end_date, created_at")
      .eq("property_id", propertyId)
      .eq("status", "active")
      .or("role.eq.food_vendor,service_type.eq.food_vendor,category.eq.food_vendor")
      .order("created_at", { ascending: false });

    if (vendorsError) {
      console.error("[saas-mobile-server] cafeteria GET vendors error:", vendorsError);
      return NextResponse.json({ error: vendorsError.message }, { status: 500 });
    }

    const foodVendors = (vendors ?? []) as any[];

    // ── 2. Active commission cycles + today's revenue ─────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const vendorIds = foodVendors.map((v) => v.id);

    let cycles: any[] = [];
    let dailyRevenues: any[] = [];

    if (vendorIds.length > 0) {
      const { data: cycleData, error: cycleError } = await admin
        .from("commission_cycles")
        .select("*")
        .in("vendor_id", vendorIds)
        .eq("status", "in_progress");

      if (cycleError) {
        console.error("[saas-mobile-server] cafeteria GET cycles error:", cycleError);
      } else {
        cycles = cycleData ?? [];
      }

      const { data: revenueData, error: revenueError } = await admin
        .from("vendor_daily_revenue")
        .select("vendor_id, revenue_date, revenue_amount")
        .in("vendor_id", vendorIds)
        .eq("revenue_date", today);

      if (revenueError) {
        console.error("[saas-mobile-server] cafeteria GET revenue error:", revenueError);
      } else {
        dailyRevenues = revenueData ?? [];
      }
    }

    // Build enriched vendor objects
    const enrichedVendors = foodVendors.map((vendor) => {
      const activeCycle = cycles.find((c) => c.vendor_id === vendor.id);
      const todayRevenue = dailyRevenues
        .filter((r) => r.vendor_id === vendor.id)
        .reduce((sum, r) => sum + (r.revenue_amount || 0), 0);

      return {
        ...vendor,
        active_cycle: activeCycle || null,
        today_revenue: todayRevenue,
      };
    });

    // ── 3. Recent cafeteria tickets (last 7 days) ─────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    const { data: recentTickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id, title, status, priority, category, subcategory, created_at, updated_at, ticket_number, raised_by, assigned_to, description")
      .eq("property_id", propertyId)
      .eq("category", "cafeteria")
      .gte("created_at", sevenDaysAgoStr)
      .order("created_at", { ascending: false })
      .limit(50);

    if (ticketsError) {
      console.error("[saas-mobile-server] cafeteria GET tickets error:", ticketsError);
    }

    // ── 4. Top-level stats ────────────────────────────────────────────────────
    const todayRevenue = enrichedVendors.reduce(
      (sum, v) => sum + (v.today_revenue || 0),
      0
    );
    const activeVendors = enrichedVendors.length;
    const openTickets = (recentTickets ?? []).filter(
      (t) => t.status === "open" || t.status === "in_progress" || t.status === "assigned"
    ).length;

    return NextResponse.json({
      success: true,
      vendors: enrichedVendors,
      todayRevenue,
      activeVendors,
      openTickets,
      recentTickets: recentTickets ?? [],
    });
  } catch (error) {
    console.error("[saas-mobile-server] cafeteria GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
