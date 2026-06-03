import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageOrganization, getUserProfile } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const callerId = auth.user.id;

    const targetUserId = request.nextUrl.searchParams.get("user_id") || callerId;
    const profile = await getUserProfile(callerId);
    const isMasterAdmin = !!profile?.is_master_admin;

    const admin = createAdminClient();
    const { data: orgMembership } = await admin
      .from("organization_memberships")
      .select("role, organization_id")
      .eq("user_id", callerId)
      .eq("is_active", true)
      .maybeSingle();

    const isOrgSuperAdmin = orgMembership?.role === "org_super_admin";
    if (!isMasterAdmin && !isOrgSuperAdmin && callerId !== targetUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let query = admin
      .from("super_tenant_properties")
      .select("id, property_id, organization_id, assigned_by, created_at, properties(id, name, code, status)")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (!isMasterAdmin) {
      const { data: callerOrgs } = await admin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", callerId)
        .eq("is_active", true);

      const orgIds = callerOrgs?.map((o: any) => o.organization_id) ?? [];
      if (orgIds.length === 0) {
        return NextResponse.json({ properties: [] });
      }
      query = query.in("organization_id", orgIds);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ properties: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] super-tenant GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const callerId = auth.user.id;

    const body = await request.json();
    const userId = body.user_id;
    const propertyIds = body.property_ids;
    const organizationId = body.organization_id;

    if (!userId || !Array.isArray(propertyIds) || propertyIds.length === 0 || !organizationId) {
      return NextResponse.json({ error: "Missing required fields: user_id, property_ids, organization_id" }, { status: 400 });
    }

    const profile = await getUserProfile(callerId);
    const isMasterAdmin = !!profile?.is_master_admin;
    const canManageOrg = await canManageOrganization(callerId, organizationId);
    if (!isMasterAdmin && !canManageOrg) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: targetUser } = await admin.from("users").select("id, full_name, email").eq("id", userId).maybeSingle();
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    const uniquePropertyIds = [...new Set(propertyIds)];
    const { data: validProperties } = await admin
      .from("properties")
      .select("id")
      .in("id", uniquePropertyIds)
      .eq("organization_id", organizationId);

    if (!validProperties || validProperties.length !== uniquePropertyIds.length) {
      return NextResponse.json({ error: "One or more properties do not belong to the specified organization" }, { status: 400 });
    }

    await admin
      .from("organization_memberships")
      .upsert({ user_id: userId, organization_id: organizationId, role: "super_tenant", is_active: true }, { onConflict: "user_id,organization_id" });

    const assignmentRows = propertyIds.map((propertyId: string) => ({
      user_id: userId,
      property_id: propertyId,
      organization_id: organizationId,
      assigned_by: callerId
    }));

    const { error: assignError } = await admin.from("super_tenant_properties").upsert(assignmentRows, { onConflict: "user_id,property_id" });
    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    await admin.from("property_memberships").upsert(
      propertyIds.map((propertyId: string) => ({
        user_id: userId,
        property_id: propertyId,
        organization_id: organizationId,
        role: "super_tenant",
        is_active: true
      })),
      { onConflict: "user_id,property_id" }
    );

    return NextResponse.json({
      success: true,
      message: `Assigned ${propertyIds.length} property/properties to ${targetUser.email}`,
      user: targetUser
    });
  } catch (error) {
    console.error("[saas-mobile-server] super-tenant POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const callerId = auth.user.id;

    const body = await request.json();
    const userId = body.user_id;
    const propertyId = body.property_id;
    if (!userId || !propertyId) {
      return NextResponse.json({ error: "Missing user_id or property_id" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: property } = await admin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle();
    if (!property?.organization_id) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const profile = await getUserProfile(callerId);
    const isMasterAdmin = !!profile?.is_master_admin;
    const canManageOrg = await canManageOrganization(callerId, property.organization_id);
    if (!isMasterAdmin && !canManageOrg) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await admin.from("super_tenant_properties").delete().eq("user_id", userId).eq("property_id", propertyId);
    await admin.from("property_memberships").delete().eq("user_id", userId).eq("property_id", propertyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] super-tenant DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
