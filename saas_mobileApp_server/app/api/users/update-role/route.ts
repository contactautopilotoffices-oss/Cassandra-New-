import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageOrganization, canManageProperty, getUserProfile, getPropertyOrganizationId } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

interface UpdateRoleRequest {
  userId: string;
  newRole: string;
  propertyId?: string;
  organizationId?: string;
  skills?: string[];
  oldRole?: string;
}

const ORG_LEVEL_ROLES = new Set(["org_super_admin"]);
const PROPERTY_LEVEL_ROLES = new Set(["property_admin", "staff", "mst", "security", "tenant"]);

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as UpdateRoleRequest;
    const { userId, newRole, propertyId, organizationId, skills = [] } = body;

    if (!userId || !newRole) {
      return NextResponse.json({ error: "Missing required fields: userId, newRole" }, { status: 400 });
    }

    const callerProfile = await getUserProfile(auth.user.id);
    const isMasterAdmin = !!callerProfile?.is_master_admin;

    let authorized = false;
    if (isMasterAdmin) {
      authorized = true;
    } else if (propertyId) {
      const canManageProp = await canManageProperty(auth.user.id, propertyId);
      if (organizationId) {
        authorized = canManageProp && await canManageOrganization(auth.user.id, organizationId);
      } else {
        authorized = canManageProp;
      }
    } else if (organizationId) {
      authorized = await canManageOrganization(auth.user.id, organizationId);
    }

    if (!authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const AUTH_ORG_LEVEL_ROLES = new Set(["org_super_admin", "org_admin", "owner", "admin"]);
    if (AUTH_ORG_LEVEL_ROLES.has(newRole)) {
      let canAssignOrgRole = isMasterAdmin;
      if (!canAssignOrgRole && organizationId) {
        canAssignOrgRole = await canManageOrganization(auth.user.id, organizationId);
      }
      if (!canAssignOrgRole && propertyId) {
        const propOrgId = await getPropertyOrganizationId(propertyId);
        if (propOrgId) {
          canAssignOrgRole = await canManageOrganization(auth.user.id, propOrgId);
        }
      }
      if (!canAssignOrgRole) {
        return NextResponse.json(
          { error: "Forbidden: insufficient privileges to assign org-level role" },
          { status: 403 }
        );
      }
    }

    const admin = createAdminClient();
    const isNewRoleOrgLevel = ORG_LEVEL_ROLES.has(newRole);

    let oldRole = "";
    let oldRoleSource: "property" | "org" | "" = "";

    if (propertyId) {
      const { data } = await admin
        .from("property_memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .maybeSingle();
      if (data?.role) {
        oldRole = data.role;
        oldRoleSource = "property";
      }
    }

    if (organizationId) {
      const { data } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (data?.role) {
        oldRole = data.role;
        oldRoleSource = "org";
      }
    }

    const isPromotionToOrg = isNewRoleOrgLevel && oldRoleSource === "property" && !!organizationId;
    const isDemotionToProperty = PROPERTY_LEVEL_ROLES.has(newRole) && oldRoleSource === "org" && !!organizationId;

    if (isPromotionToOrg) {
      const { data: existingOrgMembership } = await admin
        .from("organization_memberships")
        .select("user_id")
        .eq("user_id", userId)
        .eq("organization_id", organizationId!)
        .maybeSingle();

      if (existingOrgMembership) {
        await admin
          .from("organization_memberships")
          .update({ role: newRole, is_active: true })
          .eq("user_id", userId)
          .eq("organization_id", organizationId!);
      } else {
        await admin.from("organization_memberships").insert({
          user_id: userId,
          organization_id: organizationId!,
          role: newRole,
          is_active: true
        });
      }

      const { data: orgProperties } = await admin.from("properties").select("id").eq("organization_id", organizationId!);
      if (orgProperties?.length) {
        await admin
          .from("property_memberships")
          .update({ is_active: false })
          .eq("user_id", userId)
          .in("property_id", orgProperties.map((property) => property.id));
      }
    } else if (isDemotionToProperty) {
      let targetPropertyId = propertyId;

      if (!targetPropertyId) {
        const { data: existingPropMemberships } = await admin
          .from("property_memberships")
          .select("property_id")
          .eq("user_id", userId)
          .eq("is_active", false);

        if (existingPropMemberships?.length) {
          targetPropertyId = existingPropMemberships[0].property_id;
        } else {
          const { data: firstProperty } = await admin
            .from("properties")
            .select("id")
            .eq("organization_id", organizationId!)
            .limit(1)
            .maybeSingle();
          targetPropertyId = firstProperty?.id;
        }
      }

      if (!targetPropertyId) {
        return NextResponse.json({ error: "No property found in this organization to assign the user to." }, { status: 400 });
      }

      const { data: existingPropertyMembership } = await admin
        .from("property_memberships")
        .select("user_id")
        .eq("user_id", userId)
        .eq("property_id", targetPropertyId)
        .maybeSingle();

      if (existingPropertyMembership) {
        await admin
          .from("property_memberships")
          .update({ role: newRole, is_active: true })
          .eq("user_id", userId)
          .eq("property_id", targetPropertyId);
      } else {
        await admin.from("property_memberships").insert({
          user_id: userId,
          property_id: targetPropertyId,
          role: newRole,
          is_active: true
        });
      }

      await admin
        .from("organization_memberships")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("organization_id", organizationId!);
    } else if (propertyId) {
      await admin
        .from("property_memberships")
        .update({ role: newRole })
        .eq("user_id", userId)
        .eq("property_id", propertyId);
    } else if (organizationId) {
      await admin
        .from("organization_memberships")
        .update({ role: newRole })
        .eq("user_id", userId)
        .eq("organization_id", organizationId);
    }

    const resolverRoles = new Set(["mst", "staff"]);
    const isNewResolver = resolverRoles.has(newRole);
    const isOldResolver = resolverRoles.has(oldRole);

    if (isOldResolver && !isNewResolver) {
      if (propertyId) {
        await admin.from("resolver_stats").delete().eq("user_id", userId).eq("property_id", propertyId);
      } else {
        await admin.from("resolver_stats").delete().eq("user_id", userId);
      }
      await admin.from("mst_skills").delete().eq("user_id", userId);
    } else if (isNewResolver) {
      await admin.from("mst_skills").delete().eq("user_id", userId);

      if (skills.length > 0) {
        await admin.from("mst_skills").insert(skills.map((code) => ({ user_id: userId, skill_code: code })));

        if (propertyId) {
          const filteredSkills =
            newRole === "mst"
              ? skills.filter((skill) => ["technical", "plumbing", "vendor"].includes(skill))
              : skills.filter((skill) => ["soft_services"].includes(skill));

          await admin.from("resolver_stats").delete().eq("user_id", userId).eq("property_id", propertyId);

          if (filteredSkills.length > 0) {
            const { data: skillGroups } = await admin
              .from("skill_groups")
              .select("id, code")
              .eq("is_active", true)
              .in("code", filteredSkills);

            if (skillGroups?.length) {
              await admin.from("resolver_stats").insert(
                skillGroups.map((group) => ({
                  user_id: userId,
                  property_id: propertyId,
                  skill_group_id: group.id,
                  current_floor: 1,
                  avg_resolution_minutes: 60,
                  total_resolved: 0,
                  is_available: true
                }))
              );
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[saas-mobile-server] users/update-role error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
