import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vendorId } = await context.params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const admin = createAdminClient();
    
    // Auth check: get vendor's property_id
    const { data: vendor } = await admin
      .from("vendors")
      .select("property_id")
      .eq("id", vendorId)
      .single();

    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, vendor.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let query = admin
      .from("commission_cycles")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("cycle_start", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[saas-mobile-server] commission cycles GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const activeCycle = data?.find((c: any) => c.status === "in_progress");
    let dailyBreakdown: any[] = [];

    if (activeCycle) {
      const { data: revenues } = await admin
        .from("vendor_daily_revenue")
        .select("revenue_date, revenue_amount")
        .eq("vendor_id", vendorId)
        .gte("revenue_date", activeCycle.cycle_start)
        .lte("revenue_date", activeCycle.cycle_end)
        .order("revenue_date", { ascending: true });

      dailyBreakdown = revenues || [];
    }

    return NextResponse.json({ success: true, cycles: data, current_cycle: activeCycle || null, daily_breakdown: dailyBreakdown });
  } catch (error) {
    console.error("[saas-mobile-server] commission cycles GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vendorId } = await context.params;
    const admin = createAdminClient();

    const { data: vendor } = await admin
      .from("vendors")
      .select("commission_rate, property_id")
      .eq("id", vendorId)
      .single();

    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, vendor.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: lastCycle } = await admin
      .from("commission_cycles")
      .select("cycle_number, cycle_end")
      .eq("vendor_id", vendorId)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .single();

    const nextCycleNumber = (lastCycle?.cycle_number || 0) + 1;
    const cycleStart = lastCycle
      ? new Date(new Date(lastCycle.cycle_end).getTime() + 24 * 60 * 60 * 1000)
      : new Date();
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 14);

    const { data, error } = await admin
      .from("commission_cycles")
      .insert({
        vendor_id: vendorId,
        property_id: vendor.property_id,
        cycle_number: nextCycleNumber,
        cycle_start: cycleStart.toISOString().split("T")[0],
        cycle_end: cycleEnd.toISOString().split("T")[0],
        commission_rate: vendor.commission_rate,
        status: "in_progress",
      })
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] commission cycles POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cycle: data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] commission cycles POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { vendorId } = await context.params;
    const body = await request.json();

    if (!body.cycle_id) {
      return NextResponse.json({ error: "Cycle ID required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: vendor } = await admin.from("vendors").select("property_id").eq("id", vendorId).single();
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, vendor.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updateData: any = {
      status: body.status,
      updated_at: new Date().toISOString(),
    };

    if (body.status === "paid") {
      updateData.paid_at = new Date().toISOString();
    }

    const { data, error } = await admin
      .from("commission_cycles")
      .update(updateData)
      .eq("id", body.cycle_id)
      .eq("vendor_id", vendorId)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] commission cycles PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cycle: data });
  } catch (error) {
    console.error("[saas-mobile-server] commission cycles PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
