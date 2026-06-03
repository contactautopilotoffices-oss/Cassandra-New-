import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization, canManageProperty } from "@/lib/authorization";
import { canUserSeePrices } from "@/lib/procurement";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from("procurement_budgets").select("*").eq("property_id", propertyId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizationId = data?.[0]?.organization_id as string | undefined;
    const showPrices = organizationId ? await canUserSeePrices(auth.user.id, organizationId, propertyId) : false;
    const masked = (data ?? []).map((budget: any) => ({
      ...budget,
      total_amount: showPrices ? budget.total_amount : null,
      spent_amount: showPrices ? budget.spent_amount : null,
    }));

    return NextResponse.json(masked);
  } catch (error) {
    console.error("[saas-mobile-server] procurement budgets GET error:", error);
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
    const { property_id, organization_id, budget_type, total_amount } = body;

    if (!property_id || !organization_id || !budget_type || total_amount === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canManage =
      (await canManageProperty(auth.user.id, property_id)) ||
      (await canManageOrganization(auth.user.id, organization_id));
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("procurement_budgets")
      .upsert(
        {
          property_id,
          organization_id,
          budget_type,
          total_amount,
          period_start: periodStart,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,budget_type,period_start" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[saas-mobile-server] procurement budgets POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
