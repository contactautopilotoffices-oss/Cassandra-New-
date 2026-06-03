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
    const templateId = request.nextUrl.searchParams.get("templateId");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "20");
    if (!propertyId || !templateId) return NextResponse.json({ error: "Missing params" }, { status: 400 });
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sop_completions")
      .select("*, user:users(id, full_name), items:sop_completion_items(*, checked_by_user:users(full_name)))")
      .eq("template_id", templateId)
      .eq("property_id", propertyId)
      .order("completed_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: "Failed to fetch completions" }, { status: 500 });
    return NextResponse.json({ completions: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] checklist template completions GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
