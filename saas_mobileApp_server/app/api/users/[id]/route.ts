import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageOrganization, canManageProperty, getUserProfile } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

interface UpdateUserRequest {
  full_name?: string;
  phone?: string;
  is_active?: boolean;
  organizationId?: string;
  propertyId?: string;
}

async function canManageTargetUser(actorUserId: string, targetUserId: string) {
  const profile = await getUserProfile(actorUserId);
  if (profile?.is_master_admin) return true;

  const admin = createAdminClient();

  const { data: targetOrgMemberships } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  if (targetOrgMemberships) {
    for (const membership of targetOrgMemberships) {
      if (await canManageOrganization(actorUserId, membership.organization_id)) {
        return true;
      }
    }
  }

  const { data: targetPropMemberships } = await admin
    .from("property_memberships")
    .select("property_id")
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  if (targetPropMemberships) {
    for (const membership of targetPropMemberships) {
      if (await canManageProperty(actorUserId, membership.property_id)) {
        return true;
      }
    }
  }

  return false;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as UpdateUserRequest;
    const { full_name, phone, is_active, organizationId, propertyId } = body;

    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const isSelfUpdate = auth.user.id === id;
    const canManage = await canManageTargetUser(auth.user.id, id);

    if (!isSelfUpdate && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isSelfUpdate && (organizationId || propertyId)) {
      const canManageScope = organizationId
        ? await canManageOrganization(auth.user.id, organizationId)
        : propertyId
        ? await canManageProperty(auth.user.id, propertyId)
        : false;
      if (!canManageScope) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (isSelfUpdate && is_active !== undefined) {
      return NextResponse.json({ error: "Users cannot change their own active status" }, { status: 403 });
    }

    const admin = createAdminClient();
    const updatePayload: Record<string, unknown> = {};
    if (full_name !== undefined) updatePayload.full_name = full_name.trim();
    if (phone !== undefined) updatePayload.phone = phone.trim() || null;
    if (is_active !== undefined && canManage) updatePayload.is_active = is_active;

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
    }

    const { data: user, error } = await admin
      .from("users")
      .update(updatePayload)
      .eq("id", id)
      .select("id, full_name, email, phone, is_active")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (is_active === false && canManage) {
      if (propertyId) {
        await admin
          .from("property_memberships")
          .update({ is_active: false })
          .eq("user_id", id)
          .eq("property_id", propertyId);
      } else if (organizationId) {
        await admin
          .from("organization_memberships")
          .update({ is_active: false })
          .eq("user_id", id)
          .eq("organization_id", organizationId);

        const { data: properties } = await admin
          .from("properties")
          .select("id")
          .eq("organization_id", organizationId);

        if (properties?.length) {
          await admin
            .from("property_memberships")
            .update({ is_active: false })
            .eq("user_id", id)
            .in("property_id", properties.map((property) => property.id));
        }
      }
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("[saas-mobile-server] users/[id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const hardDelete = request.nextUrl.searchParams.get("hard") === "true";
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    const propertyId = request.nextUrl.searchParams.get("propertyId");

    if (!id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const profile = await getUserProfile(auth.user.id);
    const canManage = await canManageTargetUser(auth.user.id, id);

    if (hardDelete) {
      if (!profile?.is_master_admin) {
        return NextResponse.json({ error: "Only master admins can hard delete users" }, { status: 403 });
      }
    } else if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hardDelete && (organizationId || propertyId)) {
      const canManageScope = organizationId
        ? await canManageOrganization(auth.user.id, organizationId)
        : propertyId
        ? await canManageProperty(auth.user.id, propertyId)
        : false;
      if (!canManageScope) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const admin = createAdminClient();

    if (hardDelete) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(id);
      if (authDeleteError) {
        return NextResponse.json({ error: authDeleteError.message }, { status: 500 });
      }

      await admin.from("users").delete().eq("id", id);
      await admin.from("property_memberships").delete().eq("user_id", id);
      await admin.from("organization_memberships").delete().eq("user_id", id);
      await admin.from("mst_skills").delete().eq("user_id", id);
      await admin.from("resolver_stats").delete().eq("user_id", id);

      return NextResponse.json({ success: true, hardDeleted: true });
    }

    await admin.from("users").update({ is_active: false }).eq("id", id);

    if (propertyId) {
      await admin
        .from("property_memberships")
        .update({ is_active: false })
        .eq("user_id", id)
        .eq("property_id", propertyId);
    } else if (organizationId) {
      await admin
        .from("organization_memberships")
        .update({ is_active: false })
        .eq("user_id", id)
        .eq("organization_id", organizationId);

      const { data: properties } = await admin
        .from("properties")
        .select("id")
        .eq("organization_id", organizationId);

      if (properties?.length) {
        await admin
          .from("property_memberships")
          .update({ is_active: false })
          .eq("user_id", id)
          .in("property_id", properties.map((property) => property.id));
      }
    } else {
      await admin.from("organization_memberships").update({ is_active: false }).eq("user_id", id);
      await admin.from("property_memberships").update({ is_active: false }).eq("user_id", id);
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("[saas-mobile-server] users/[id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
