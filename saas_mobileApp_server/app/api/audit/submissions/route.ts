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
    const period = request.nextUrl.searchParams.get("period") || "2025-26";

    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("property_audit_submissions")
      .select("*")
      .eq("property_id", propertyId)
      .eq("audit_period_year", period)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[saas-mobile-server] audit submissions GET error:", error);
      return NextResponse.json({ error: "Failed to fetch audit submissions" }, { status: 500 });
    }

    return NextResponse.json({ submissions: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] audit submissions GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      master_item_id,
      property_id,
      organization_id,
      status,
      remark,
      proof_url,
      audit_period_year,
    } = body;

    if (!master_item_id || !property_id || !organization_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const period = audit_period_year || "2025-26";

    // Upsert via unique constraint (master_item_id, property_id, audit_period_year)
    const { data, error } = await admin
      .from("property_audit_submissions")
      .upsert(
        {
          master_item_id,
          property_id,
          organization_id,
          status: status || "missing",
          remark: remark ?? null,
          proof_url: proof_url ?? null,
          audit_period_year: period,
          submitted_by: auth.user.id,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "master_item_id,property_id,audit_period_year" }
      )
      .select("*")
      .single();

    if (error) {
      console.error("[saas-mobile-server] audit submissions PATCH error:", error);
      return NextResponse.json({ error: "Failed to upsert submission" }, { status: 500 });
    }

    return NextResponse.json({ submission: data });
  } catch (error) {
    console.error("[saas-mobile-server] audit submissions PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
