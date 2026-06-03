import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const query = request.nextUrl.searchParams.get("query") || "";
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    let hostQuery = admin
      .from("property_memberships")
      .select("user_id, user:users(id, full_name, email)")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .limit(5);
    if (query.length >= 2) {
      hostQuery = hostQuery.ilike("user.full_name", `%${query}%`);
    }

    const { data, error } = await hostQuery;
    if (error) return NextResponse.json({ error: "Failed to fetch hosts" }, { status: 500 });
    const hosts = (data ?? [])
      .map((row: any) => ({
        id: row.user_id,
        full_name: row.user?.full_name ?? "Unknown",
        email: row.user?.email ?? "",
      }))
      .filter((row: any) => row.id);

    return NextResponse.json({ hosts });
  } catch (error) {
    console.error("[saas-mobile-server] visitors hosts GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
