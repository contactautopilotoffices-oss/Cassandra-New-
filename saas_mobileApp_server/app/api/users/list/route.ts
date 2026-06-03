import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageOrganization, canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get("orgId") ?? searchParams.get("organizationId");
    const propertyId = searchParams.get("propertyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    if (!orgId && !propertyId) {
      return NextResponse.json({ error: "Missing required parameter: orgId or propertyId" }, { status: 400 });
    }

    const admin = createAdminClient();

    if (propertyId) {
      const hasAccess = await getPropertyAccess(auth.user.id, propertyId);
      const canManage = await canManageProperty(auth.user.id, propertyId);
      if (!hasAccess.authorized || !canManage) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data, error } = await admin
        .from("property_memberships")
        .select(
          `
          role,
          is_active,
          created_at,
          property:properties(id, name),
          user:users(id, full_name, email, user_photo_url, phone)
          `
        )
        .eq("property_id", propertyId)
        .eq("is_active", true);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const users = ((data ?? []) as any[])
        .map((item: any) => ({
          id: item.user?.id,
          full_name: item.user?.full_name,
          email: item.user?.email,
          user_photo_url: item.user?.user_photo_url,
          propertyRole: item.role,
          propertyName: item.property?.name,
          propertyId: item.property?.id,
          is_active: item.is_active,
          joined_at: item.created_at,
          phone: item.user?.phone
        }))
        .filter((user) => !!user.id)
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

      return NextResponse.json({ users });
    }

    if (!(await canManageOrganization(auth.user.id, orgId!))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: orgUsers, error: orgError } = await admin
      .from("organization_memberships")
      .select(
        `
        role,
        is_active,
        created_at,
        user:users(id, full_name, email, user_photo_url, phone)
        `
      )
      .eq("organization_id", orgId!)
      .eq("is_active", true);

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    const { data: propUsers, error: propError } = await admin
      .from("property_memberships")
      .select(
        `
        role,
        is_active,
        created_at,
        property:properties!inner(id, name, organization_id),
        user:users(id, full_name, email, user_photo_url, phone)
        `
      )
      .eq("properties.organization_id", orgId!)
      .eq("is_active", true);

    if (propError) {
      return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    const userMap = new Map<string, any>();

    for (const item of (orgUsers ?? []) as any[]) {
      if (!item.user?.id) continue;
      userMap.set(item.user.id, {
        id: item.user.id,
        full_name: item.user.full_name,
        email: item.user.email,
        user_photo_url: item.user.user_photo_url,
        orgRole: item.role,
        organizationId: orgId,
        is_active: item.is_active,
        joined_at: item.created_at,
        phone: item.user.phone
      });
    }

    for (const item of (propUsers ?? []) as any[]) {
      if (!item.user?.id) continue;
      const existing = userMap.get(item.user.id);
      if (existing) {
        existing.propertyRole = item.role;
        existing.propertyName = item.property?.name;
        existing.propertyId = item.property?.id;
      } else {
        userMap.set(item.user.id, {
          id: item.user.id,
          full_name: item.user.full_name,
          email: item.user.email,
          user_photo_url: item.user.user_photo_url,
          propertyRole: item.role,
          propertyName: item.property?.name,
          propertyId: item.property?.id,
          is_active: item.is_active,
          joined_at: item.created_at,
          phone: item.user.phone
        });
      }
    }

    const users = Array.from(userMap.values()).sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[saas-mobile-server] users/list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
