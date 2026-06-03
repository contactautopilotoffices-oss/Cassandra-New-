import { createAdminClient } from "@/lib/supabase/admin";

const ORG_ADMIN_ROLES = new Set(["org_super_admin", "org_admin", "admin", "owner"]);
const PROPERTY_ADMIN_ROLES = new Set(["property_admin"]);
const CREDIT_ADMIN_ROLES = new Set(["property_admin", "staff", "security", "org_admin", "org_super_admin", "owner"]);

export async function getUserProfile(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("users").select("id, is_master_admin").eq("id", userId).maybeSingle();
  return data;
}

export async function getPropertyOrganizationId(propertyId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle();
  return data?.organization_id ?? null;
}

export async function getOrganizationRole(userId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  return data?.role ?? null;
}

export async function getPropertyRole(userId: string, propertyId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("property_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle();

  return data?.role ?? null;
}

export async function canManageOrganization(userId: string, organizationId: string) {
  const profile = await getUserProfile(userId);
  if (profile?.is_master_admin) return true;
  const orgRole = await getOrganizationRole(userId, organizationId);
  return !!orgRole && ORG_ADMIN_ROLES.has(orgRole);
}

export async function canManageProperty(userId: string, propertyId: string) {
  const profile = await getUserProfile(userId);
  if (profile?.is_master_admin) return true;

  const propertyRole = await getPropertyRole(userId, propertyId);
  if (propertyRole && PROPERTY_ADMIN_ROLES.has(propertyRole)) return true;

  const organizationId = await getPropertyOrganizationId(propertyId);
  if (!organizationId) return false;

  const orgRole = await getOrganizationRole(userId, organizationId);
  return !!orgRole && ORG_ADMIN_ROLES.has(orgRole);
}

export async function canManageMeetingRoomCredits(userId: string, propertyId: string) {
  const profile = await getUserProfile(userId);
  if (profile?.is_master_admin) return true;

  const propertyRole = await getPropertyRole(userId, propertyId);
  if (propertyRole && CREDIT_ADMIN_ROLES.has(propertyRole)) return true;

  const organizationId = await getPropertyOrganizationId(propertyId);
  if (!organizationId) return false;

  const orgRole = await getOrganizationRole(userId, organizationId);
  return !!orgRole && CREDIT_ADMIN_ROLES.has(orgRole);
}
