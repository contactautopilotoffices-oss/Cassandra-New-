import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization, canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }
    const organizationId = searchParams.get("organizationId");

    if (!propertyId && !organizationId) {
      return NextResponse.json({ error: "Property ID or Organization ID is required" }, { status: 400 });
    }

    if (propertyId) {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (organizationId && !(await canManageOrganization(auth.user.id, organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin.from("procurement_price_visibility").select("*");
    query = propertyId ? query.eq("property_id", propertyId) : query.eq("organization_id", organizationId!);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (propertyId) {
      const record = data?.[0] ?? {};
      return NextResponse.json({
        roles: record.roles ?? [],
        users: record.users ?? [],
      });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("[saas-mobile-server] procurement settings GET error:", error);
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
    const { property_id, organization_id, price_visibility_roles, price_visibility_users } = body;

    if (!property_id || !organization_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canManage =
      (await canManageProperty(auth.user.id, property_id)) ||
      (await canManageOrganization(auth.user.id, organization_id));
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("procurement_price_visibility").upsert({
      property_id,
      organization_id,
      roles: price_visibility_roles ?? [],
      users: price_visibility_users ?? [],
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] procurement settings POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
