import { createAdminClient } from "@/lib/supabase/admin";

const ALWAYS_ALLOWED_ORG_ROLES = new Set(["procurement", "org_super_admin", "master_admin"]);

export async function canUserSeePrices(
  userId: string,
  organizationId: string,
  propertyId?: string
): Promise<boolean> {
  if (!userId || !organizationId) {
    return false;
  }

  const admin = createAdminClient();

  const [orgMembershipRes, propertyMembershipsRes] = await Promise.all([
    admin
      .from("organization_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("property_memberships")
      .select("role, property_id")
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);

  const orgRole = orgMembershipRes.data?.role ?? "";
  const propertyMemberships = propertyMembershipsRes.data ?? [];

  if (ALWAYS_ALLOWED_ORG_ROLES.has(orgRole)) {
    return true;
  }

  const { data: settings } = await admin
    .from("procurement_price_visibility")
    .select("property_id, roles, users")
    .eq("organization_id", organizationId);

  if (!settings?.length) {
    return false;
  }

  for (const config of settings) {
    if (config.users?.includes(userId)) {
      return true;
    }

    if (propertyId && config.property_id !== propertyId) {
      continue;
    }

    if (orgRole && config.roles?.includes(orgRole)) {
      return true;
    }

    const propertyRole = propertyMemberships.find((membership) => membership.property_id === config.property_id)?.role;
    if (propertyRole && config.roles?.includes(propertyRole)) {
      return true;
    }
  }

  return false;
}
