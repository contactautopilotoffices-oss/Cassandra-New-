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
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: generators }, { data: readings }] = await Promise.all([
      admin.from("generators").select("*").eq("property_id", propertyId).order("name"),
      admin.from("diesel_readings").select("*").eq("property_id", propertyId).order("reading_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({ generators: generators ?? [], readings: readings ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] diesel GET error:", error);
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
    if (!propertyId || !body.generator_id || !body.reading_date) {
      return NextResponse.json({ error: "Missing diesel reading fields" }, { status: 400 });
    }
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();

    // 1. Look up active tariff
    const { data: tariffData } = await admin
      .rpc("get_active_dg_tariff", {
        p_generator_id: body.generator_id,
        p_date: body.reading_date,
      });

    const tariffRate = (tariffData as any)?.[0]?.cost_per_litre ?? 0;
    const tariffId = (tariffData as any)?.[0]?.id ?? null;

    // 2. Compute values
    const consumedLitres = Math.max(
      0,
      Number(body.opening_diesel_level) + Number(body.diesel_added_litres ?? 0) - Number(body.closing_diesel_level)
    );
    const runHours = Number(body.closing_hours) - Number(body.opening_hours);
    const computedCost = consumedLitres * tariffRate;

    // 3. Check for existing reading on same date
    const { data: existing } = await admin
      .from("diesel_readings")
      .select("id")
      .eq("generator_id", body.generator_id)
      .eq("reading_date", body.reading_date)
      .maybeSingle();

    const insertPayload = {
      property_id: propertyId,
      generator_id: body.generator_id,
      reading_date: body.reading_date,
      opening_hours: body.opening_hours,
      closing_hours: body.closing_hours,
      opening_kwh: body.opening_kwh ?? null,
      closing_kwh: body.closing_kwh ?? null,
      opening_diesel_level: body.opening_diesel_level,
      closing_diesel_level: body.closing_diesel_level,
      diesel_added_litres: body.diesel_added_litres ?? 0,
      computed_consumed_litres: consumedLitres,
      computed_run_hours: runHours,
      computed_cost: computedCost,
      tariff_rate_used: tariffRate,
      tariff_id: tariffId,
      notes: body.notes ?? null,
      created_by: auth.user.id,
      alert_status: body.alert_status ?? "normal",
    };

    let result;
    if (existing?.id) {
      const { data, error } = await admin
        .from("diesel_readings")
        .update(insertPayload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: "Failed to update diesel reading" }, { status: 500 });
      result = data;
    } else {
      const { data, error } = await admin
        .from("diesel_readings")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: "Failed to create diesel reading" }, { status: 500 });
      result = data;
    }

    // 4. Update generator carry-forward values
    await admin
      .from("generators")
      .update({
        initial_run_hours: body.closing_hours,
        initial_diesel_level: body.closing_diesel_level,
        initial_kwh_reading: body.closing_kwh ?? null,
      })
      .eq("id", body.generator_id);

    return NextResponse.json({ success: true, reading: result }, { status: existing?.id ? 200 : 201 });
  } catch (error) {
    console.error("[saas-mobile-server] diesel POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
