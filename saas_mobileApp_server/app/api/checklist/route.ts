import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

const ADMIN_ROLES = ["property_admin", "org_admin", "org_super_admin", "master_admin"];

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const [{ data: templates, error }, { data: members }, { data: property }] = await Promise.all([
      admin
        .from("sop_templates")
        .select("*, items:sop_checklist_items(*), completions:sop_completions(*, user:users(id, full_name), items:sop_completion_items(*, checked_by_user:users(full_name)))")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      admin
        .from("property_memberships")
        .select("user_id, role, users:users(id, full_name)")
        .eq("property_id", propertyId)
        .eq("is_active", true),
      admin.from("properties").select("organization_id").eq("id", propertyId).maybeSingle(),
    ]);
    if (error) return NextResponse.json({ error: "Failed to fetch checklist data" }, { status: 500 });

    const propertyMembers = (members ?? [])
      .map((m: any) => ({
        id: m.users?.id || m.user_id,
        full_name: m.users?.full_name || "Unknown",
        role: m.role,
      }))
      .filter((m: any) => m.id);

    // Determine if this user is an admin for this property
    const userMembership = (members ?? []).find((m: any) => (m.users?.id || m.user_id) === auth.user!.id);
    const userRole = userMembership?.role?.toLowerCase() ?? "";
    const isAdmin = ADMIN_ROLES.includes(userRole);

    // Filter templates: admins see all; others only see templates where
    // assigned_to is empty (open to all) OR their user ID is included.
    // This matches the web app behavior in SOPTemplateManager & SOPCompletionHistory.
    const userId = auth.user.id;
    const filteredTemplates = isAdmin
      ? (templates ?? [])
      : (templates ?? []).filter((t: any) => {
          const assignedTo: string[] = t.assigned_to ?? [];
          return assignedTo.length === 0 || assignedTo.includes(userId);
        });

    return NextResponse.json({
      templates: filteredTemplates,
      propertyMembers,
      organizationId: property?.organization_id ?? null,
    });
  } catch (error) {
    console.error("[saas-mobile-server] checklist GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

