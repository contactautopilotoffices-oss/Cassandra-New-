import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function getAuthenticatedUser(request: NextRequest): Promise<{
  token: string | null;
  user: AuthenticatedUser | null;
  response?: NextResponse;
}> {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return {
      token: null,
      user: null,
      response: NextResponse.json({ error: "Missing bearer token" }, { status: 401 })
    };
  }

  const supabase = createAnonClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      token,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return {
    token,
    user: {
      id: data.user.id,
      email: data.user.email
    }
  };
}

// ── Role Constants (aligned with app_role enum + saas_one web app) ─────────
// NOTE: The DB enum app_role only contains: master_admin, org_super_admin,
// property_admin, staff, tenant, food_vendor, mst, security, vendor,
// soft_service_staff, soft_service_supervisor, soft_service_manager,
// super_tenant, maintenance_vendor, procurement.
// The web app TypeScript types also reference org_admin / owner, but these
// do NOT exist in the current DB enum.

/** Org-level admin roles that have access to ALL properties in the org */
const ORG_ADMIN_ROLES = new Set(["org_super_admin"]);

/** Property-level roles that grant scoped access to a specific property */
const PROPERTY_ROLES = new Set([
  "property_admin", "staff", "mst", "tenant", "security",
  "soft_service_manager", "soft_service_staff", "soft_service_supervisor",
  "food_vendor", "vendor", "maintenance_vendor", "procurement"
]);

// ── Property Access (read gate) ────────────────────────────────────────────
// Mirrors saas_one web app property-access logic + super_tenant portfolio check.
// Any user that can READ property data passes this gate.

export async function getPropertyAccess(userId: string, propertyId: string) {
  const admin = createAdminClient();

  // 1. Master admin bypass
  const { data: userProfile } = await admin
    .from("users")
    .select("is_master_admin")
    .eq("id", userId)
    .maybeSingle();

  if (userProfile?.is_master_admin) {
    return { authorized: true, role: "master_admin" };
  }

  // 2. Org-level admin / procurement / super_tenant check
  const { data: property } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (property?.organization_id) {
    const { data: orgMembership } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", property.organization_id)
      .eq("is_active", true)
      .maybeSingle();

    // Org admins get access to ALL properties in the org
    if (orgMembership && ORG_ADMIN_ROLES.has(orgMembership.role)) {
      return { authorized: true, role: orgMembership.role };
    }

    // Super tenant: must have property in their portfolio
    if (orgMembership?.role === "super_tenant") {
      const { data: stProp } = await admin
        .from("super_tenant_properties")
        .select("id")
        .eq("user_id", userId)
        .eq("property_id", propertyId)
        .eq("organization_id", property.organization_id)
        .maybeSingle();

      if (stProp) {
        return { authorized: true, role: "super_tenant" };
      }
    }

    // Any active org member can read property-scoped data (mirrors web app RLS)
    if (orgMembership) {
      return { authorized: true, role: orgMembership.role };
    }
  }

  // 3. Property-level membership (any active role)
  const { data: propertyMembership } = await admin
    .from("property_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle();

  if (propertyMembership) {
    return { authorized: true, role: propertyMembership.role };
  }

  return { authorized: false as const };
}
