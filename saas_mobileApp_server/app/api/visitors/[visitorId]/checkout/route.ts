import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ visitorId: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { visitorId } = await params;
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data: visitor, error: findError } = await admin
      .from("visitor_logs")
      .select("*")
      .eq("visitor_id", visitorId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (findError || !visitor) return NextResponse.json({ error: "Visitor log not found" }, { status: 404 });

    if (visitor.status === "checked_out") {
      return NextResponse.json({ success: true, message: "Already checked out", visitor });
    }

    const { data, error } = await admin
      .from("visitor_logs")
      .update({ status: "checked_out", checkout_time: new Date().toISOString() })
      .eq("id", visitor.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed to check out visitor" }, { status: 500 });

    return NextResponse.json({
      success: true,
      message: `Goodbye ${visitor.name}! Logged out successfully.`,
      visitor: data,
    });
  } catch (error) {
    console.error("[saas-mobile-server] visitor checkout PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
