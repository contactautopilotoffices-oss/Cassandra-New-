import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    
    // Fetch PPM schedules — align with saas_one web app logic
    let scheduleQuery = admin
      .from("ppm_schedules")
      .select("*, maintenance_vendors(id, company_name, contact_person, phone, is_active)")
      .eq("property_id", propertyId);
    
    if (organizationId) scheduleQuery = scheduleQuery.eq("organization_id", organizationId);
    
    // Fetch AMC contracts
    let contractQuery = admin
      .from("amc_contracts")
      .select("*")
      .eq("property_id", propertyId);
    
    if (organizationId) contractQuery = contractQuery.eq("organization_id", organizationId);
    
    const [schedulesResult, contractsResult] = await Promise.all([
      scheduleQuery.order("planned_date", { ascending: true }),
      contractQuery.order("contract_end_date", { ascending: true })
    ]);

    if (schedulesResult.error) {
      console.error("[saas-mobile-server] ppm GET schedules error:", schedulesResult.error);
      return NextResponse.json({ error: schedulesResult.error.message, details: schedulesResult.error.details, hint: schedulesResult.error.hint }, { status: 500 });
    }

    if (contractsResult.error) {
      console.error("[saas-mobile-server] ppm GET contracts error:", contractsResult.error);
      return NextResponse.json({ error: contractsResult.error.message, details: contractsResult.error.details, hint: contractsResult.error.hint }, { status: 500 });
    }

    const schedules = schedulesResult.data;
    const contracts = contractsResult.data;

    return NextResponse.json({ schedules: schedules ?? [], contracts: contracts ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] ppm GET error:", error);
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
    const propertyId = body.property_id || body.propertyId;
    if (!propertyId || !body.system_name) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ppm_schedules")
      .insert({
        property_id: propertyId,
        organization_id: body.organization_id ?? null,
        system_name: body.system_name,
        detail_name: body.detail_name ?? null,
        scope_of_work: body.scope_of_work ?? null,
        frequency: body.frequency ?? 'monthly',
        planned_date: body.planned_date,
        location: body.location ?? null,
        vendor_name: body.vendor_name ?? null,
        vendor_phone: body.vendor_phone ?? null,
        status: body.status ?? 'pending',
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });

    return NextResponse.json({ success: true, schedule: data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] ppm POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
