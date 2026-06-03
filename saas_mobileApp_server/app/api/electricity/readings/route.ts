import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    const meterId = searchParams.get("meterId");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("electricity_readings")
      .select("*, meter:electricity_meters(*)")
      .eq("property_id", propertyId);

    if (meterId) query = query.eq("meter_id", meterId);
    if (fromDate) query = query.gte("reading_date", fromDate);
    if (toDate) query = query.lte("reading_date", toDate);

    query = query.order("reading_date", { ascending: false });

    const { data: readings, error } = await query;

    if (error) {
      console.error("[saas-mobile-server] electricity readings GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, readings: readings ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] electricity readings GET error:", error);
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
    if (!propertyId || !body.meter_id || !body.reading_date) {
      return NextResponse.json({ error: "Missing reading fields" }, { status: 400 });
    }
    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // 1. Look up active multiplier and tariff
    const [{ data: multData }, { data: tariffData }] = await Promise.all([
      admin.rpc("get_active_multiplier", { p_meter_id: body.meter_id, p_date: body.reading_date }),
      admin.rpc("get_active_grid_tariff", { p_property_id: propertyId, p_date: body.reading_date }),
    ]);

    const multiplierValue = (multData as any)?.[0]?.multiplier_value ?? 1;
    const multiplierId = (multData as any)?.[0]?.id ?? null;
    const tariffRate = (tariffData as any)?.[0]?.rate_per_unit ?? 0;
    const tariffId = (tariffData as any)?.[0]?.id ?? null;

    // 2. Compute values
    const rawUnits = Number(body.closing_reading) - Number(body.opening_reading);
    const finalUnits = rawUnits * multiplierValue;
    const computedCost = finalUnits * tariffRate;

    // 3. Check for existing reading on same date
    const { data: existing } = await admin
      .from("electricity_readings")
      .select("id")
      .eq("meter_id", body.meter_id)
      .eq("reading_date", body.reading_date)
      .maybeSingle();

    const insertPayload = {
      property_id: propertyId,
      meter_id: body.meter_id,
      reading_date: body.reading_date,
      opening_reading: body.opening_reading,
      closing_reading: body.closing_reading,
      computed_units: rawUnits,
      final_units: finalUnits,
      computed_cost: computedCost,
      multiplier_id: multiplierId,
      multiplier_value_used: multiplierValue,
      tariff_rate_used: tariffRate,
      tariff_id: tariffId,
      notes: body.notes ?? null,
      photo_url: body.photo_url ?? null,
      created_by: auth.user.id,
      alert_status: body.alert_status ?? "normal",
    };

    let result;
    if (existing?.id) {
      const { data, error } = await admin
        .from("electricity_readings")
        .update(insertPayload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: "Failed to update electricity reading" }, { status: 500 });
      result = data;
    } else {
      const { data, error } = await admin
        .from("electricity_readings")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: "Failed to create electricity reading" }, { status: 500 });
      result = data;
    }

    // 4. Update meter last_reading
    await admin.from("electricity_meters").update({ last_reading: body.closing_reading }).eq("id", body.meter_id);

    return NextResponse.json({ success: true, reading: result }, { status: existing?.id ? 200 : 201 });
  } catch (error) {
    console.error("[saas-mobile-server] electricity readings POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
