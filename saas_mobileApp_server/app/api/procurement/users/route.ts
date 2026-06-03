import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization } from "@/lib/authorization";

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

    const admin = createAdminClient();

    if (propertyId) {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (organizationId && !(await canManageOrganization(auth.user.id, organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userMap = new Map<string, { id: string; full_name: string; email: string; user_photo_url?: string | null; role: string }>();

    if (propertyId) {
      const { data: propertyMemberships, error } = await admin
        .from("property_memberships")
        .select("user_id, role, user:users!user_id(id, full_name, email, user_photo_url)")
        .eq("property_id", propertyId)
        .eq("role", "procurement")
        .eq("is_active", true);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const membership of (propertyMemberships ?? []) as any[]) {
        if (membership.user?.id) {
          userMap.set(membership.user.id, {
            id: membership.user.id,
            full_name: membership.user.full_name,
            email: membership.user.email,
            user_photo_url: membership.user.user_photo_url,
            role: membership.role,
          });
        }
      }
    }

    if (organizationId || propertyId) {
      let orgId = organizationId;
      if (!orgId && propertyId) {
        const { data: property } = await admin
          .from("properties")
          .select("organization_id")
          .eq("id", propertyId)
          .maybeSingle();
        orgId = property?.organization_id ?? null;
      }

      if (orgId) {
        const { data: organizationMemberships, error } = await admin
          .from("organization_memberships")
          .select("user_id, role, user:users!user_id(id, full_name, email, user_photo_url)")
          .eq("organization_id", orgId)
          .eq("role", "procurement")
          .eq("is_active", true);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        for (const membership of (organizationMemberships ?? []) as any[]) {
          if (membership.user?.id && !userMap.has(membership.user.id)) {
            userMap.set(membership.user.id, {
              id: membership.user.id,
              full_name: membership.user.full_name,
              email: membership.user.email,
              user_photo_url: membership.user.user_photo_url,
              role: membership.role,
            });
          }
        }
      }
    }

    return NextResponse.json(Array.from(userMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name)));
  } catch (error) {
    console.error("[saas-mobile-server] procurement users GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
