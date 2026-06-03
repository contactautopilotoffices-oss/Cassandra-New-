import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageOrganization, canManageProperty, getUserProfile } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateUserRequest {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  organization_id: string;
  role?: string;
  username?: string;
  create_master_admin?: boolean;
  property_id?: string;
  specialization?: string;
  skills?: string[];
}

const ALLOWED_ROLES = ["master_admin", "org_super_admin", "property_admin", "staff", "mst", "tenant", "procurement"];

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreateUserRequest;
    const {
      email,
      password,
      full_name,
      organization_id,
      role = "staff",
      username,
      property_id,
      phone,
      specialization,
      skills = []
    } = body;

    const createMasterAdmin = body.create_master_admin === true;

    if (!email || !full_name || (!organization_id && !createMasterAdmin)) {
      return NextResponse.json(
        { error: "Missing required fields: email, full_name, and organization_id (unless creating master admin)" },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: `Invalid role "${role}"` }, { status: 400 });
    }

    const currentProfile = await getUserProfile(auth.user.id);
    const isCurrentMasterAdmin = !!currentProfile?.is_master_admin;

    if (createMasterAdmin) {
      if (!isCurrentMasterAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      let authorized = false;
      if (property_id) {
        const canManageProp = await canManageProperty(auth.user.id, property_id);
        if (organization_id) {
          authorized = canManageProp && await canManageOrganization(auth.user.id, organization_id);
        } else {
          authorized = canManageProp;
        }
      } else if (organization_id) {
        authorized = await canManageOrganization(auth.user.id, organization_id);
      }
      if (!authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const admin = createAdminClient();
    const userPassword = password || generateTempPassword();

    const { data: createdUserData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        username: username || email.split("@")[0],
        created_by: auth.user.id,
        organization_id: organization_id || null
      }
    });

    if (createError) {
      const status = createError.message.includes("already registered") ? 409 : 500;
      return NextResponse.json({ error: createError.message }, { status });
    }

    if (!createdUserData.user) {
      return NextResponse.json({ error: "User creation failed - no user returned" }, { status: 500 });
    }

    const createdUserId = createdUserData.user.id;

    if (createMasterAdmin) {
      await admin.from("users").update({ is_master_admin: true }).eq("id", createdUserId);
    }

    if (role === "org_super_admin" || role === "procurement") {
      if (organization_id) {
        const { error } = await admin
          .from("organization_memberships")
          .insert({ organization_id, user_id: createdUserId, role, is_active: true });
        if (error) {
          await admin.auth.admin.deleteUser(createdUserId);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    if (property_id) {
      const { error } = await admin.from("property_memberships").insert({
        property_id,
        organization_id: organization_id || null,
        user_id: createdUserId,
        role,
        is_active: true
      });

      if (error) {
        if (role !== "org_super_admin" && role !== "procurement") {
          await admin.auth.admin.deleteUser(createdUserId);
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const effectiveSkills = skills.length > 0 ? skills : specialization ? [specialization] : [];
    if ((role === "staff" || role === "mst") && effectiveSkills.length > 0) {
      for (const skillCode of effectiveSkills) {
        await admin.from("mst_skills").insert({ user_id: createdUserId, skill_code: skillCode });
      }

      if (property_id) {
        const validSkillCodes =
          role === "mst"
            ? effectiveSkills.filter((skill) => ["technical", "plumbing", "vendor"].includes(skill))
            : effectiveSkills.filter((skill) => ["soft_services"].includes(skill));

        if (validSkillCodes.length > 0) {
          const { data: skillGroups } = await admin
            .from("skill_groups")
            .select("id, code")
            .eq("is_active", true)
            .in("code", validSkillCodes);

          if (skillGroups?.length) {
            await admin.from("resolver_stats").insert(
              skillGroups.map((group) => ({
                user_id: createdUserId,
                property_id,
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

    if (phone) {
      await admin.from("users").update({ phone }).eq("id", createdUserId);
    }

    return NextResponse.json({
      success: true,
      message: `User ${email} created successfully.`,
      user: {
        id: createdUserId,
        email: createdUserData.user.email,
        full_name,
        role: createMasterAdmin ? "master_admin" : role
      },
      requiresPasswordReset: !password
    });
  } catch (error) {
    console.error("[saas-mobile-server] users/create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let password = "";
  for (let index = 0; index < 12; index += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
