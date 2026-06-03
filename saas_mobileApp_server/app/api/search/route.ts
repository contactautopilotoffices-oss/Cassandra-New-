import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SEARCHABLE_TABLES = [
  { table: "tickets", type: "ticket", labelColumn: "title", sublabelColumn: "ticket_number", extraColumns: ["status", "priority"] },
  { table: "users", type: "user", labelColumn: "full_name", sublabelColumn: "email", extraColumns: [] },
  { table: "properties", type: "property", labelColumn: "name", sublabelColumn: "code", extraColumns: [] },
  { table: "stock_items", type: "stock_item", labelColumn: "name", sublabelColumn: "item_code", extraColumns: [] },
  { table: "vendors", type: "vendor", labelColumn: "name", sublabelColumn: "service_type", extraColumns: [] },
] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const propertyId = searchParams.get("propertyId");

    if (!q || q.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve user's accessible property IDs
    const { data: userProfile } = await admin
      .from("users")
      .select("is_master_admin")
      .eq("id", auth.user.id)
      .maybeSingle();

    const isMasterAdmin = userProfile?.is_master_admin ?? false;

    let allowedPropertyIds: string[] | null = null;
    if (!isMasterAdmin) {
      const { data: memberships } = await admin
        .from("property_memberships")
        .select("property_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true);
      allowedPropertyIds = (memberships ?? []).map((m) => m.property_id);

      // Also include org-level properties via organization_memberships
      const { data: orgMemberships } = await admin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true);

      const orgIds = (orgMemberships ?? []).map((m) => m.organization_id);
      if (orgIds.length > 0) {
        const { data: orgProperties } = await admin
          .from("properties")
          .select("id")
          .in("organization_id", orgIds);
        const orgPropertyIds = (orgProperties ?? []).map((p) => p.id);
        allowedPropertyIds = Array.from(new Set([...allowedPropertyIds, ...orgPropertyIds]));
      }

      if (allowedPropertyIds.length === 0) {
        return NextResponse.json({ results: [] });
      }
    }

    // If propertyId provided, verify access
    if (propertyId && propertyId !== "undefined" && propertyId !== "null") {
      const access = await getPropertyAccess(auth.user.id, propertyId);
      if (!access.authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const pattern = `%${q}%`;
    const results: any[] = [];
    const limit = 10;

    for (const config of SEARCHABLE_TABLES) {
      let query = admin
        .from(config.table)
        .select(`id, ${config.labelColumn}, ${config.sublabelColumn}${config.extraColumns.length > 0 ? ", " + config.extraColumns.join(", ") : ""}`)
        .or(`${config.labelColumn}.ilike.${pattern},${config.sublabelColumn}.ilike.${pattern}`)
        .limit(limit);

      if (propertyId && propertyId !== "undefined" && propertyId !== "null") {
        // Specific property scope
        if (config.table === "users") {
          const { data: userIds } = await admin
            .from("property_memberships")
            .select("user_id")
            .eq("property_id", propertyId)
            .eq("is_active", true);
          const ids = (userIds ?? []).map((u) => u.user_id);
          if (ids.length === 0) continue;
          query = query.in("id", ids);
        } else if (config.table === "properties") {
          query = query.eq("id", propertyId);
        } else {
          query = query.eq("property_id", propertyId);
        }
      } else if (!isMasterAdmin && allowedPropertyIds) {
        // Global search scoped to accessible properties
        if (config.table === "users") {
          const { data: userIds } = await admin
            .from("property_memberships")
            .select("user_id")
            .in("property_id", allowedPropertyIds)
            .eq("is_active", true);
          const ids = Array.from(new Set((userIds ?? []).map((u) => u.user_id)));
          if (ids.length === 0) continue;
          query = query.in("id", ids);
        } else if (config.table === "properties") {
          query = query.in("id", allowedPropertyIds);
        } else {
          query = query.in("property_id", allowedPropertyIds);
        }
      }

      const { data, error } = await query;

      if (error) {
        console.error(`[saas-mobile-server] search ${config.table} error:`, error);
        continue;
      }

      for (const row of (data ?? []) as any[]) {
        results.push({
          id: row.id,
          type: config.type,
          label: row[config.labelColumn] ?? "",
          sublabel: row[config.sublabelColumn] ?? "",
          data: row,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[saas-mobile-server] search GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
