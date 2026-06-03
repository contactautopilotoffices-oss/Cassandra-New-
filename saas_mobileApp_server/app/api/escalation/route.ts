import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const includeUsers = request.nextUrl.searchParams.get("includeUsers") === "true";
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: hierarchies, error } = await admin
      .from("escalation_hierarchies")
      .select("*, levels:escalation_levels(*)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Failed to fetch hierarchies" }, { status: 500 });

    let users: any[] = [];
    if (includeUsers) {
      const { data: members } = await admin
        .from("property_memberships")
        .select("user_id, users:user_id(full_name, email)")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      users = (members ?? [])
        .map((m: any) => ({
          id: m.user_id,
          full_name: m.users?.full_name ?? "Unknown",
          email: m.users?.email ?? "",
        }))
        .filter((u: any) => u.id);
    }

    return NextResponse.json({ hierarchies: hierarchies ?? [], users });
  } catch (error) {
    console.error("[saas-mobile-server] escalation hierarchies GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const propertyId = body.propertyId || body.property_id;
    const levels = Array.isArray(body.levels) ? body.levels : [];
    if (!propertyId || !body.name) return NextResponse.json({ error: "Missing hierarchy fields" }, { status: 400 });
    if (!(await canManageProperty(auth.user.id, propertyId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: hierarchy, error } = await admin
      .from("escalation_hierarchies")
      .insert({ property_id: propertyId, name: body.name, description: body.description ?? null })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed to create hierarchy" }, { status: 500 });

    if (levels.length > 0) {
      const rows = levels
        .filter((level: any) => level.role || level.user_id)
        .map((level: any, index: number) => ({
          hierarchy_id: hierarchy.id,
          level: index + 1,
          role: level.role || null,
          user_id: level.user_id || null,
          user_name: level.user_name || null,
          response_time_minutes: level.response_time_minutes ?? 30,
        }));
      if (rows.length > 0) {
        const { error: levelsError } = await admin.from("escalation_levels").insert(rows);
        if (levelsError) return NextResponse.json({ error: "Failed to create escalation levels" }, { status: 500 });
      }
    }

    const { data: fullHierarchy } = await admin
      .from("escalation_hierarchies")
      .select("*, levels:escalation_levels(*)")
      .eq("id", hierarchy.id)
      .single();

    return NextResponse.json({ success: true, hierarchy: fullHierarchy }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] escalation hierarchies POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
