import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageOrganization } from "@/lib/authorization";
import { canUserSeePrices } from "@/lib/procurement";

async function getScopedPropertyIds(admin: ReturnType<typeof createAdminClient>, userId: string, requestedPropertyId: string | null) {
  const { data: orgMemberships } = await admin
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("is_active", true);

  const hoOrgIds = (orgMemberships ?? [])
    .filter((membership) => ["org_super_admin", "master_admin", "procurement"].includes(membership.role))
    .map((membership) => membership.organization_id);

  if (hoOrgIds.length > 0) {
    return { organizationIds: hoOrgIds, propertyIds: requestedPropertyId ? [requestedPropertyId] : null };
  }

  const { data: propertyMemberships } = await admin
    .from("property_memberships")
    .select("property_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  const propertyIds = (propertyMemberships ?? []).map((membership) => membership.property_id);
  if (!propertyIds.length) {
    return { organizationIds: [], propertyIds: [] };
  }

  if (requestedPropertyId && !propertyIds.includes(requestedPropertyId)) {
    return { organizationIds: [], propertyIds: [] };
  }

  return { organizationIds: [], propertyIds: requestedPropertyId ? [requestedPropertyId] : propertyIds };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const organizationId = request.nextUrl.searchParams.get("organizationId");

    const admin = createAdminClient();

    if (propertyId) {
      const access = await getPropertyAccess(userId, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (organizationId && !(await canManageOrganization(userId, organizationId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let query = admin
      .from("material_requests")
      .select(
        `
        *,
        line_items:material_request_items(*),
        ticket:tickets(
          id,
          ticket_number,
          title,
          status,
          priority,
          created_at,
          assigned_to,
          floor_number,
          assignee:users!tickets_assigned_to_fkey(full_name)
        ),
        property:properties(id, name),
        requester:users!material_requests_requested_by_fkey(full_name, email),
        assignee:users!material_requests_assignee_uid_fkey(full_name)
        `
      )
      .order("created_at", { ascending: false });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    } else {
      const scoped = await getScopedPropertyIds(admin, userId, propertyId);
      if (scoped.organizationIds.length > 0) {
        if (scoped.propertyIds?.length) {
          query = query.in("organization_id", scoped.organizationIds).eq("property_id", scoped.propertyIds[0]);
        } else {
          query = query.in("organization_id", scoped.organizationIds);
        }
      } else if (scoped.propertyIds?.length) {
        query = query.in("property_id", scoped.propertyIds);
      } else {
        return NextResponse.json([]);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error("[saas-mobile-server] procurement tickets GET error:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    const formatted = await Promise.all(
      (data ?? []).map(async (requestItem: any) => {
        const items = [...(Array.isArray(requestItem.items) ? requestItem.items : []), ...(requestItem.line_items ?? [])];
        const showPrices = requestItem.organization_id
          ? await canUserSeePrices(userId, requestItem.organization_id, requestItem.property_id ?? undefined)
          : false;

        return {
          ...requestItem,
          items: items.map((item: any) =>
            showPrices
              ? item
              : {
                  ...item,
                  unit_price: null,
                  total_price: null,
                  estimated_cost: null,
                }
          ),
          total_amount: showPrices ? requestItem.total_amount : null,
          total_estimated_cost: showPrices ? requestItem.total_estimated_cost : null,
        };
      })
    );

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("[saas-mobile-server] procurement tickets GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
