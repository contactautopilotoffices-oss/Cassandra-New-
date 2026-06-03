import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify user belongs to this organization
    const { data: orgMembership } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    const { data: userProfile } = await admin
      .from("users")
      .select("is_master_admin")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!orgMembership && !userProfile?.is_master_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("audit_master_items")
      .select("*")
      .eq("organization_id", organizationId)
      .order("si_no", { ascending: true });

    if (error) {
      console.error("[saas-mobile-server] audit master-items GET error:", error);
      return NextResponse.json({ error: "Failed to fetch audit master items" }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] audit master-items GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
